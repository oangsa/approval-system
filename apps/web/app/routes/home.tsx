import { Navigate } from "react-router";
import { useSession } from "~/modules/auth/sessionContext";
import { LandingPage } from "~/modules/landing/LandingPage";

export function meta()
{
    return [
        { title: "Workflow and Approval System" },
        { name: "description", content: "Submit requests, review the details, and follow each decision in one shared approval workspace." },
    ];
}

export default function Home()
{
    const { status } = useSession();
    return status === "authenticated" ? <Navigate to="/dashboard" replace /> : <LandingPage />;
}
