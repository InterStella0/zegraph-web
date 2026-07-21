export default function NotFound() {
    return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
            <div className="text-center space-y-4 max-w-md">
                <h1 className="text-9xl font-black text-muted-foreground">404</h1>
                <h2 className="text-2xl font-semibold">Session Not Found</h2>
                <p className="text-muted-foreground">
                    Nobody has ever had this session before. Maybe you're schizoing?
                </p>
            </div>
        </div>
    );
}
