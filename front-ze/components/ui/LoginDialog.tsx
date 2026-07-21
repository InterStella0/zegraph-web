import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "components/ui/dialog";
import {Button} from "components/ui/button";
import {signIn} from "next-auth/react";
import {SiSteam} from "@icons-pack/react-simple-icons";

export default function LoginDialog({ open, onClose }: { open: boolean, onClose: () => void}) {
    const handleSteamLogin = () => {
        onClose();
        signIn("steam")
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="text-center">
                    <DialogTitle className="text-2xl font-semibold">
                        Welcome Back
                    </DialogTitle>
                    <DialogDescription>
                        Sign in
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-6 items-center px-6 pb-4">
                    <p className="text-base text-muted-foreground text-center">
                        Continue with your steam account to access all features
                    </p>
                    <Button
                        onClick={handleSteamLogin}
                        size="lg"
                        className="w-full"
                    >
                        <SiSteam className="mr-2 h-4 w-4" />
                        Login with Steam
                    </Button>

                    <p className="text-xs text-muted-foreground text-center mt-2">
                        By continuing, you will be redirected to a third-party site for authentication.
                    </p>
                </div>
            </DialogContent>
        </Dialog>
    );
}