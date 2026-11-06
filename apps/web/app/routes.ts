import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("auth/login", "routes/auth/login.tsx"),
    route("unauthorized", "routes/unauthorized/index.tsx"),
    layout("routes/protected.tsx", [
        route("dashboard", "routes/dashboard/index.tsx"),
        route("settings", "routes/settings/index.tsx"),
    ]),
] satisfies RouteConfig;
