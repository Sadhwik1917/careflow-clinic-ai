import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/clinic/patients")({ component: Outlet });
