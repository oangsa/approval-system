import { useCallback, useEffect, useState } from "react";
import type { PublishedRequestType } from "@workflow/contracts";
import { readRequestTypeSelection } from "~/services/requestService";
import { presentFailure } from "./requestPresentation";

export type RequestTypeSelection = Pick<PublishedRequestType, "id" | "name" | "code">;

/** The parent remounts for each account generation; metadata never enters browser persistence. */
export function useRequestTypeSelection(typeId: string, generation: number)
{
    const [known, setKnown] = useState<Record<string, RequestTypeSelection>>({});
    const [attempt, setAttempt] = useState(0);
    const [failure, setFailure] = useState<{ id: string; terminal: boolean; message: string } | null>(null);
    const remember = useCallback((type: RequestTypeSelection) => setKnown((current) => ({ ...current, [type.id]: type })), []);
    const selection = known[typeId];
    useEffect(() =>
    {
        if (!typeId || selection) return;
        const controller = new AbortController();
        setFailure(null);
        readRequestTypeSelection(typeId, controller.signal, generation).then((type) =>
        {
            if (controller.signal.aborted) return;
            if (type) remember(type);
            else setFailure({ id: typeId, terminal: true, message: "This request type is unavailable. Clear it or choose another type." });
        }).catch((error: unknown) =>
        {
            if (controller.signal.aborted) return;
            const failure = presentFailure(error, "Could not load the selected request type.");
            setFailure({ id: typeId, terminal: failure.terminal, message: failure.terminal ? "This request type is unavailable. Clear it or choose another type." : "Could not load the selected request type." });
        });
        return () => controller.abort();
    }, [typeId, selection, generation, attempt, remember]);
    return { selection, remember, failure: failure?.id === typeId && !selection ? failure : null, retry: () => setAttempt((value) => value + 1) };
}
