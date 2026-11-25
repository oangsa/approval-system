import { index, layout, route, type RouteConfig } from "@react-router/dev/routes";

export default [
    index("routes/home.tsx"),
    route("auth/login", "routes/auth/login.tsx"),
    route("unauthorized", "routes/unauthorized/index.tsx"),
    layout("routes/protected.tsx", [
        route("reviews", "routes/reviews/index.tsx"),
        route("reviews/:taskId", "routes/reviews/task.tsx"),
        route("requests", "routes/requests/index.tsx"),
        route("requests/new", "routes/requests/new.tsx"),
        route("requests/:id/edit", "routes/requests/edit.tsx"),
        route("requests/:id", "routes/requests/detail.tsx"),
        route("admin/request-types", "routes/admin/request-types/index.tsx"),
        route("admin/request-types/new", "routes/admin/request-types/new.tsx"),
        route("admin/request-types/:id", "routes/admin/request-types/detail.tsx"),
        route("dashboard", "routes/dashboard/index.tsx"),
        route("settings", "routes/settings/index.tsx"),
    ]),
] satisfies RouteConfig;
