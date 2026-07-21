type DebouncedFunction<T extends (...args: any[]) => void> = T & {
    cancel: () => void;
};