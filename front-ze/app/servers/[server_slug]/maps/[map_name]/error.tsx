"use client"
import {notFound} from "next/navigation";
import {StatusPage} from "components/common/StatusPage";

export default function ErrorBoundary({ error }: { error: Error }){
    if (error.message === "Not Found")
        notFound()

    if (error.message === "Data is not ready")
        return <StatusPage code="Calculating..." title="Please be nice~">
            Sorry, this map's information is still being calculated. Please come back later~
        </StatusPage>
    return <StatusPage code=":/" title="Something went wrong :/">Something went wrong trying to load this map.</StatusPage>
}
