import * as React from "react";
import {ChevronDown} from "lucide-react";
import {getTranslations} from "next-intl/server";
import {GAME_META} from "components/ui/ServerIndicator";
import {DOMAIN} from "utils/generalUtils";
import {Community} from "types/community";

const DISCORD_URL = "https://goes.queeniemella.cc/s/discord-zegraph";

// CS2 first, then CS:GO, then CS:S. Games with no live server are omitted.
const GAME_ORDER = ["730_cs2", "730_csgo", "240"];

function gameLabels(communities: Community[]): string[] {
    const present = new Set(
        communities.flatMap(c => c.servers.map(s => s.game).filter(g => !!g))
    );
    return GAME_ORDER.filter(g => present.has(g)).map(g => GAME_META[g].label);
}

function richToPlain(node: React.ReactNode): string {
    if (node === null || node === undefined || typeof node === "boolean") return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(richToPlain).join("");
    if (React.isValidElement(node)) {
        const props = node.props as {children?: React.ReactNode; "aria-hidden"?: boolean};
        if (props["aria-hidden"]) return "";
        return richToPlain(props.children);
    }
    return "";
}

const answerClass = "text-sm text-muted-foreground leading-relaxed";

// A bullet like "Label: description" renders its label emphasised.
function OwnerBullet({text}: {text: string}) {
    const idx = text.indexOf(": ");
    return <li className="flex gap-2">
        <span aria-hidden className="select-none text-muted-foreground/50">&bull;</span>
        <span>
            {idx === -1
                ? text
                : <><strong className="font-medium text-foreground">{text.slice(0, idx)}</strong>{text.slice(idx)}</>}
        </span>
    </li>;
}

type Faq = { q: string; body: React.ReactNode; plain: string };

export default async function HomeFaq(
    {communitiesDataPromise}: { communitiesDataPromise: Promise<Community[]> }
) {
    const communities = await communitiesDataPromise;
    const t = await getTranslations('home');

    const serverCount = communities.reduce((sum, c) => sum + c.servers.length, 0);
    const games = gameLabels(communities);

    const canDescribeCommunities = communities.length > 0 && serverCount > 0 && games.length > 0;
    const separator = t('faq.supportedGameSeparator');
    const supportedAnswer = canDescribeCommunities
        ? t('faq.supportedA', {
            communities: t('communityCount', {count: communities.length}),
            servers: t('serverCount', {count: serverCount}),
            games: games.join(separator),
            list: communities
                .map(c => t('faq.supportedListItem', {
                    name: c.name,
                    servers: t('serverCount', {count: c.servers.length}),
                }))
                .join(separator),
        })
        : t('faq.supportedFallbackA');

    const simple = (a: string): Pick<Faq, "body" | "plain"> => ({
        body: <p className={`mt-3 ${answerClass}`}>{a}</p>,
        plain: a,
    });

    const contactNode = t.rich('faq.trackedOwnerContact', {
        domain: DOMAIN.replace(/^https?:\/\//, ''),
        link: chunks => <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
        >{chunks}</a>,
    });

    const ownerBullets = [
        t('faq.trackedOwnerConnectionIds'),
        t('faq.trackedOwnerMapCooldowns'),
        t('faq.trackedOwnerInfractions'),
    ];

    const tracked: Pick<Faq, "body" | "plain"> = {
        body: <div className="mt-3 flex flex-col gap-3">
            <p className={answerClass}>{t('faq.trackedA')}</p>
            <p className={answerClass}>{t('faq.trackedOwnerIntro')}</p>
            <ul className={`flex flex-col gap-1.5 ${answerClass}`}>
                {ownerBullets.map(b => <OwnerBullet key={b} text={b} />)}
            </ul>
            <p className={answerClass}>{contactNode}</p>
        </div>,
        plain: [
            t('faq.trackedA'),
            t('faq.trackedOwnerIntro'),
            ...ownerBullets.map(b => `${b}.`),
            richToPlain(contactNode),
        ].join(" "),
    };

    const faqs: Faq[] = [
        {q: t('faq.zombieEscapeQ'), ...simple(t('faq.zombieEscapeA'))},
        {q: t('faq.zeGraphQ'), ...simple(t('faq.zeGraphA'))},
        {q: t('faq.supportedQ'), ...simple(supportedAnswer)},
        {q: t('faq.trackedQ'), ...tracked},
        {q: t('faq.statisticsQ'), ...simple(t('faq.statisticsA'))},
    ];

    const jsonLd = {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        "mainEntity": faqs.map(({q, plain}) => ({
            "@type": "Question",
            "name": q,
            "acceptedAnswer": {"@type": "Answer", "text": plain},
        })),
    };

    return <section className="px-1 sm:px-0 max-w-3xl mx-auto flex flex-col gap-3 mt-2">
        <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{__html: JSON.stringify(jsonLd).replace(/</g, '\\u003c')}}
        />
        {faqs.map(({q, body}) => (
            <details key={q} className="group rounded-xl border bg-card px-4 py-3 sm:px-5 sm:py-4">
                <summary className="flex cursor-pointer list-none items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
                    <h2 className="text-sm sm:text-base font-semibold">{q}</h2>
                    <ChevronDown className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180" />
                </summary>
                {body}
            </details>
        ))}
    </section>
}
