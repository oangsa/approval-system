import type { ReactNode } from "react";
import { isRouteErrorResponse, Links, Meta, Outlet, Scripts, ScrollRestoration, useRouteError } from "react-router";
import { SessionProvider } from "~/modules/auth/sessionContext";
import "./app.css";

interface ILayoutProps
{
    children: ReactNode;
}

export function Layout({ children }: ILayoutProps)
{
    return (
        <html lang="en">
            <head>
                <meta charSet="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <Meta />
                <Links />
            </head>
            <body>
                {children}
                <ScrollRestoration />
                <Scripts />
            </body>
        </html>
    );
}

export default function App()
{
    return (
        <SessionProvider>
            <Outlet />
        </SessionProvider>
    );
}

export function ErrorBoundary()
{
    const error = useRouteError();
    const message = isRouteErrorResponse(error) && error.status === 404
        ? "Page not found"
        : "Unable to display this page";
    return <main className="mx-auto max-w-xl p-8"><h1 className="text-2xl font-semibold">{message}</h1></main>;
}
