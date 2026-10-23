/** Structured data for search engines; renders nothing without data. `<` is escaped so a value can't close the script tag. */
export function JsonLd({data}: {data: object | null}) {
    return data && <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(data).replace(/</g, '\\u003c')}} />
}
