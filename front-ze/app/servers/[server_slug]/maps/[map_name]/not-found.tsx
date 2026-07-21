export default function NotFound() {
    return (
        <div className="text-center mt-12">
            <h1 className="text-8xl font-black text-secondary">
                404
            </h1>
            <h4 className="text-4xl mt-2">
                Page Not Found
            </h4>
            <div className="my-8 mx-auto max-w-[500px] mt-6">
                <p className="text-primary">
                    There is not such page!
                </p>
            </div>
        </div>
    );
}