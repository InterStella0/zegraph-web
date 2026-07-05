import { Card } from "components/ui/card";
import { Lock } from "lucide-react";
import { getTranslations } from "next-intl/server";

export default async function AccessDenied() {
    const t = await getTranslations('players.accessDenied');
    return (
        <div className="flex justify-center items-center min-h-[60vh]">
            <Card className="p-8 text-center max-w-lg">
                <Lock className="w-16 h-16 text-destructive mx-auto mb-4" />
                <h1 className="text-3xl font-semibold mb-4">
                    {t('title')}
                </h1>
                <p className="text-muted-foreground">
                    {t('description')}
                </p>
            </Card>
        </div>
    );
}
