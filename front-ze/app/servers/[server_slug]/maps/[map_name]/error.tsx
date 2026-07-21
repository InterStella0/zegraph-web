"use client"
import {notFound} from "next/navigation";

export default function ErrorBoundary({ error }: { error: Error }){
    if (error.message === "Not Found")
        notFound()

    if (error.message === "Data is not ready")
        return     <div className="text-center mt-12">
            <h1 className="text-8xl font-black text-secondary">
                Calculating...
            </h1>
            <h4 className="text-4xl mt-2">
                Please be nice~
            </h4>
            <div className="my-8 mx-auto max-w-[500px] mt-6">
                <p className="text-primary">
                    Sorry, this map's information is still being calculated. Please come back later~
                </p>
            </div>
        </div>

    else
        return <div className="text-center mt-12">
        <h1 className="text-8xl font-black text-secondary">
            :/
        </h1>
        <h4 className="text-4xl mt-2">
            Something went wrong :/
        </h4>
        <div className="my-8 mx-auto max-w-[500px] mt-6">
            <p className="text-primary">
                Something went wrong trying to load this map.
            </p>
        </div>
    </div>
}