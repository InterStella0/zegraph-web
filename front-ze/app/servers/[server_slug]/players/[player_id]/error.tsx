"use client"
import {ReactNode} from "react";
import { notFound } from "next/navigation";

function Notice({ code, title, children }: { code: string, title: string, children: ReactNode }) {
    return (
        <div className="text-center mt-12">
            <h1 className="text-6xl font-black text-muted-foreground">{code}</h1>
            <h4 className="text-2xl mt-2">{title}</h4>
            <div className="mx-auto max-w-[500px] mt-6">
                <p className="text-foreground">{children}</p>
            </div>
        </div>
    );
}

export default function ErrorBoundary({ error }: { error: Error }) {
    if (error.message === "Not Found")
        notFound();

    if (error.message === "Data is not ready")
        return <Notice code="Calculating..." title="Please be nice~">
            Sorry, this player's information is still being calculated. Please come back later~
        </Notice>;
    return <Notice code=":/" title="Something went wrong :/">Something went wrong trying to load this player.</Notice>;
}
