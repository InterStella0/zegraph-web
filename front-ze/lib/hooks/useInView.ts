import {RefObject, useEffect, useState} from "react";

/** Whether the element is on screen; with `once`, it stays true after the element first appears. */
export function useInView(ref: RefObject<Element | null>, {threshold = 0.4, once = false} = {}) {
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting || !once) setVisible(entry.isIntersecting);
        }, {threshold});
        observer.observe(el);
        return () => observer.disconnect();
    }, [ref, threshold, once]);
    return visible;
}
