import { useEffect, useState } from "react";
import { useSession } from "~/modules/auth/sessionContext";
import { lookupSelection, type LookupKind } from "~/services/configurationService";
interface IConfigurationReferenceProps
{
    kind: LookupKind;
    id: string;
}
export function ConfigurationReference({ kind, id }: IConfigurationReferenceProps)
{
    const { generation } = useSession();
    const [label, setLabel] = useState("Loading…");
    useEffect(() =>
    {
        const controller = new AbortController();
        setLabel("Loading…");
        void lookupSelection(kind, id, controller.signal, generation).then((item) =>
        {
            if (!controller.signal.aborted) setLabel(item.label);
        }).catch(() =>
        {
            if (!controller.signal.aborted) setLabel("Unavailable selection");
        });
        return () => controller.abort();
    }, [kind, id, generation]);
    return <span>{label}</span>;
}
