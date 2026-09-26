"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useTranslations("common");
  return (
    <div className="grid min-h-dvh place-items-center px-4 text-center">
      <div>
        <p className="text-sm text-muted-foreground">{t("pageError")}</p>
        <Button className="mt-4" onClick={reset}>
          {t("tryAgain")}
        </Button>
      </div>
    </div>
  );
}
