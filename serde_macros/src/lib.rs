extern crate proc_macro;

use proc_macro::TokenStream;
use proc_macro2::TokenStream as TokenStream2;
use quote::quote;
use syn::{parse_macro_input, punctuated::Punctuated, DeriveInput, Expr, Fields, Ident, Token, Type};

#[proc_macro_attribute]
pub fn auto_serde_with(_attr: TokenStream, item: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(item as DeriveInput);
    let name = &ast.ident;
    let visibility = &ast.vis;

    let expanded = match &ast.data {
        syn::Data::Struct(data_struct) => {
            let fields = match &data_struct.fields {
                Fields::Named(fields_named) => {
                    let modified_fields = fields_named.named.iter().map(|field| {
                        let field_name = &field.ident;
                        let field_type = &field.ty;
                        let field_visibility = &field.vis;
                        let serde_attrs = get_serde_attrs(field_type);
                        quote! {
                            #serde_attrs
                            #field_visibility #field_name: #field_type,
                        }
                    });
                    quote! { { #(#modified_fields)* } }
                }
                _ => {
                    return syn::Error::new_spanned(
                        &ast,
                        "auto_serde_with can only be applied to structs with named fields",
                    )
                    .to_compile_error()
                    .into();
                }
            };

            quote! {
                #[derive(serde::Serialize, serde::Deserialize)]
                #visibility struct #name #fields
            }
        }
        _ => {
            return syn::Error::new_spanned(&ast, "auto_serde_with can only be applied to structs")
                .to_compile_error()
                .into();
        }
    };

    expanded.into()
}

/// Derive macro that generates `impl Into<Target> for Self`.
/// The thing inside models.rs got so bloat i needed a macro for it.
/// 
/// Struct attribute:
///   `#[db_into(TargetType)]`: required
///
/// Field attributes (combinable):
///   _(none)_:`self.field` (always)
///   `#[unwrap_default]`: `self.field.unwrap_or_default()`
///   `#[default(expr)]`: `self.field.unwrap_or(expr)`
///   `#[method(name)]`: `self.field.name()`
///   `#[cast(Type)]`:`self.field.unwrap_or_default() as Type` (or bare `as Type`)
///   `#[default(expr)] #[cast(T)]`: `self.field.unwrap_or(expr) as T`
///   `#[rename(target_field)]`: maps to `target_field:` in the target struct
///   `#[skip]`: excluded from the impl
///   `#[expr(tokens)]`: `tokens` verbatim (escape hatch)
///
/// Struct-level attribute for synthetic target fields with no source counterpart:
///   `#[extra(field = expr)]`: emits `field: expr` — can repeat for multiple fields
///
/// `#[rename]` can be combined with any value attribute.

#[proc_macro_derive(DbInto, attributes(db_into, extra, default, method, rename, skip, expr, cast, unwrap_default))]
pub fn db_into_derive(input: TokenStream) -> TokenStream {
    let ast = parse_macro_input!(input as DeriveInput);
    let self_name = &ast.ident;

    let target_type: syn::Path = match find_db_into_attr(&ast) {
        Ok(t) => t,
        Err(e) => return e.to_compile_error().into(),
    };

    let fields = match &ast.data {
        syn::Data::Struct(s) => match &s.fields {
            Fields::Named(f) => &f.named,
            _ => {
                return syn::Error::new_spanned(&ast, "DbInto requires named fields")
                    .to_compile_error()
                    .into()
            }
        },
        _ => {
            return syn::Error::new_spanned(&ast, "DbInto can only be used on structs")
                .to_compile_error()
                .into()
        }
    };

    let mut field_inits = Vec::new();

    // Collect #[extra(name = expr)] from struct-level attributes
    for attr in &ast.attrs {
        if attr.path().is_ident("extra") {
            let extras = match attr.parse_args_with(
                Punctuated::<ExtraField, Token![,]>::parse_terminated
            ) {
                Ok(e) => e,
                Err(e) => return e.to_compile_error().into(),
            };
            for extra in extras {
                let name = &extra.name;
                let val = &extra.value;
                field_inits.push(quote! { #name: #val, });
            }
        }
    }

    for field in fields {
        let field_name = field.ident.as_ref().unwrap();
        let field_type = &field.ty;

        if has_attr(&field.attrs, "skip") {
            continue;
        }

        let target_name: Ident =
            get_rename(&field.attrs).unwrap_or_else(|| field_name.clone());

        // #[expr(tokens)] verbatim escape hatch
        if let Some(raw) = get_expr_tokens(&field.attrs) {
            field_inits.push(quote! { #target_name: #raw, });
            continue;
        }

        let cast_ty = get_cast_type(&field.attrs);
        let opt = is_option(field_type);

        // #[method(name)] call self.field.name(), then optionally cast
        if let Some(method) = get_method(&field.attrs) {
            let val = quote! { self.#field_name.#method() };
            let val = apply_cast(val, &cast_ty);
            field_inits.push(quote! { #target_name: #val, });
            continue;
        }

        // #[default(expr)] unwrap_or(expr), then optionally cast
        if let Some(default_expr) = get_default_expr(&field.attrs) {
            let val = if opt {
                quote! { self.#field_name.unwrap_or(#default_expr) }
            } else {
                quote! { self.#field_name }
            };
            let val = apply_cast(val, &cast_ty);
            field_inits.push(quote! { #target_name: #val, });
            continue;
        }

        // #[unwrap_default] unwrap_or_default, then optionally cast
        if has_attr(&field.attrs, "unwrap_default") {
            let val = quote! { self.#field_name.unwrap_or_default() };
            let val = apply_cast(val, &cast_ty);
            field_inits.push(quote! { #target_name: #val, });
            continue;
        }

        // #[cast] alone — unwrap_or_default then cast
        if let Some(ref ty) = cast_ty {
            let val = if opt {
                quote! { self.#field_name.unwrap_or_default() as #ty }
            } else {
                quote! { self.#field_name as #ty }
            };
            field_inits.push(quote! { #target_name: #val, });
            continue;
        }

        // Type-inferred method (OffsetDateTime → to_utc_time, etc.)
        if let Some(inferred) = infer_method(field_type) {
            let val = quote! { self.#field_name.#inferred() };
            let val = apply_cast(val, &cast_ty);
            field_inits.push(quote! { #target_name: #val, });
            continue;
        }

        // True fallthrough: identity
        field_inits.push(quote! { #target_name: self.#field_name, });
    }

    let expanded = quote! {
        impl Into<#target_type> for #self_name {
            fn into(self) -> #target_type {
                #target_type {
                    #(#field_inits)*
                }
            }
        }
    };

    expanded.into()
}

// ── helpers ───────────────────────────────────────────────────────────────────

struct ExtraField {
    name: Ident,
    value: Expr,
}

impl syn::parse::Parse for ExtraField {
    fn parse(input: syn::parse::ParseStream) -> syn::Result<Self> {
        let name: Ident = input.parse()?;
        input.parse::<Token![=]>()?;
        let value: Expr = input.parse()?;
        Ok(ExtraField { name, value })
    }
}

fn find_db_into_attr(ast: &DeriveInput) -> syn::Result<syn::Path> {
    for attr in &ast.attrs {
        if attr.path().is_ident("db_into") {
            return attr.parse_args::<syn::Path>();
        }
    }
    Err(syn::Error::new_spanned(
        ast,
        "DbInto requires a #[db_into(TargetType)] attribute on the struct",
    ))
}

fn has_attr(attrs: &[syn::Attribute], name: &str) -> bool {
    attrs.iter().any(|a| a.path().is_ident(name))
}

fn get_rename(attrs: &[syn::Attribute]) -> Option<Ident> {
    for attr in attrs {
        if attr.path().is_ident("rename") {
            return attr.parse_args::<Ident>().ok();
        }
    }
    None
}

fn get_method(attrs: &[syn::Attribute]) -> Option<Ident> {
    for attr in attrs {
        if attr.path().is_ident("method") {
            return attr.parse_args::<Ident>().ok();
        }
    }
    None
}

fn get_default_expr(attrs: &[syn::Attribute]) -> Option<Expr> {
    for attr in attrs {
        if attr.path().is_ident("default") {
            return attr.parse_args::<Expr>().ok();
        }
    }
    None
}

fn get_cast_type(attrs: &[syn::Attribute]) -> Option<Type> {
    for attr in attrs {
        if attr.path().is_ident("cast") {
            return attr.parse_args::<Type>().ok();
        }
    }
    None
}

fn apply_cast(val: TokenStream2, cast_ty: &Option<Type>) -> TokenStream2 {
    if let Some(ty) = cast_ty {
        quote! { (#val) as #ty }
    } else {
        val
    }
}

fn get_expr_tokens(attrs: &[syn::Attribute]) -> Option<TokenStream2> {
    for attr in attrs {
        if attr.path().is_ident("expr") {
            return attr.parse_args::<TokenStream2>().ok();
        }
    }
    None
}

fn is_option(ty: &Type) -> bool {
    if let Type::Path(type_path) = ty {
        if let Some(seg) = type_path.path.segments.last() {
            return seg.ident == "Option";
        }
    }
    false
}

fn get_serde_attrs(field_type: &Type) -> TokenStream2 {
    match_type(field_type).unwrap_or_else(|| quote! {})
}

fn match_type(field_type: &Type) -> Option<TokenStream2> {
    let selected_types = ["OffsetDateTime", "PgInterval"];

    if let Type::Path(type_path) = field_type {
        if let Some(segment) = type_path.path.segments.last() {
            let type_name = segment.ident.to_string();

            if type_name == "Option" {
                if let syn::PathArguments::AngleBracketed(args) = &segment.arguments {
                    if let Some(syn::GenericArgument::Type(inner_type)) = args.args.first() {
                        if let Some(inner_segment) = extract_type_name(inner_type) {
                            let inner_type_name = inner_segment.to_string();
                            if selected_types.contains(&inner_type_name.as_str()) {
                                let ser = format!(
                                    "serialize_option_{}",
                                    inner_type_name.to_lowercase()
                                );
                                let de = format!(
                                    "deserialize_option_{}",
                                    inner_type_name.to_lowercase()
                                );
                                return Some(quote! {
                                    #[serde(serialize_with = #ser, deserialize_with = #de)]
                                });
                            }
                        }
                    }
                }
            } else if selected_types.contains(&type_name.as_str()) {
                let ser = format!("serialize_{}", type_name.to_lowercase());
                let de = format!("deserialize_{}", type_name.to_lowercase());
                return Some(quote! {
                    #[serde(serialize_with = #ser, deserialize_with = #de)]
                });
            }
        }
    }
    None
}

fn infer_method(ty: &Type) -> Option<Ident> {
    let span = proc_macro2::Span::call_site();
    if let Type::Path(tp) = ty {
        if let Some(seg) = tp.path.segments.last() {
            match seg.ident.to_string().as_str() {
                "OffsetDateTime" => return Some(Ident::new("to_utc_time", span)),
                "PgInterval" => return Some(Ident::new("to_f64", span)),
                "Option" => {
                    if let syn::PathArguments::AngleBracketed(args) = &seg.arguments {
                        if let Some(syn::GenericArgument::Type(inner)) = args.args.first() {
                            if let Some(name) = extract_type_name(inner) {
                                match name.to_string().as_str() {
                                    "OffsetDateTime" => return Some(Ident::new("to_utc_optional", span)),
                                    "PgInterval" => return Some(Ident::new("to_f64", span)),
                                    _ => {}
                                }
                            }
                        }
                    }
                }
                _ => {}
            }
        }
    }
    None
}

fn extract_type_name(field_type: &Type) -> Option<&syn::Ident> {
    if let Type::Path(type_path) = field_type {
        return type_path.path.segments.last().map(|seg| &seg.ident);
    }
    None
}
