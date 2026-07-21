export default function NotFound() {
    return (
        <div className="text-center mt-12">
            <h1 className="text-8xl font-black text-secondary">
                404
            </h1>
            <h4 className="text-4xl mt-2">
                Player Not Found
            </h4>
            <div className="my-8 mx-auto max-w-[500px] mt-6">
                <p className="text-primary">
                    The player you're looking for seems to have despawned or never existed.
                    Maybe it’s in another dimension?
                </p>
            </div>
        </div>
    );
}