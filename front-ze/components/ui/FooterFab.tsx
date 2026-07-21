'use client'

import { Button } from "./button";
import { ArrowUp } from "lucide-react";
import { useEffect, useState } from "react";

export default function FooterFab() {
    const [showScrollTop, setShowScrollTop] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setShowScrollTop(window.scrollY > 400);
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll);

        return () => {
            window.removeEventListener('scroll', handleScroll);
        };
    }, []);

    if (!showScrollTop) return null;

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    };

    return (
        <Button
            size="icon"
            variant="secondary"
            aria-label="scroll back to top"
            onClick={scrollToTop}
            className="fixed bottom-6 right-6 z-50 rounded-full shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
        >
            <ArrowUp className="size-4" />
        </Button>
    );
}
