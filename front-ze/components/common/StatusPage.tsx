import {ReactNode} from "react";

/** Full-page notice for not-found, still-calculating and error states. */
export function StatusPage({code, title, children}: {code: ReactNode, title: ReactNode, children: ReactNode}) {
    return (
        <div className="text-center mt-12">
            <h1 className="text-8xl font-black text-secondary">{code}</h1>
            <h4 className="text-4xl mt-2">{title}</h4>
            <div className="my-8 mx-auto max-w-[500px] mt-6">
                <p className="text-primary">{children}</p>
            </div>
        </div>
    );
}
