"use client"
import { notFound } from "next/navigation";

export default function ErrorBoundary({ error }: { error: Error }) {
    if (error.message === "Not Found")
        notFound();

    if (error.message === "Data is not ready")
        return (
            <div className="text-center mt-12">
                <h1 className="text-6xl font-black text-muted-foreground">
                    Calculating...
                </h1>
                <h4 className="text-2xl mt-2">
                    Please be nice~
                </h4>
                <div className="mx-auto max-w-[500px] mt-6">
                    <p className="text-foreground">
                        Sorry, this player's information is still being calculated. Please come back later~
                    </p>
                </div>
            </div>
        );
    else
        return (
            <div className="text-center mt-12">
                <h1 className="text-6xl font-black text-muted-foreground">
                    :/
                </h1>
                <h4 className="text-2xl mt-2">
                    Something went wrong :/
                </h4>
                <div className="mx-auto max-w-[500px] mt-6">
                    <p className="text-foreground">
                        Something went wrong trying to load this player.
                    </p>
                </div>
            </div>
        );
}
