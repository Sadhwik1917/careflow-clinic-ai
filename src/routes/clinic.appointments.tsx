import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/clinic/appointments")({ component: Outlet });
