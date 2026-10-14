import { queryOptions } from "@tanstack/react-query";
import { getAdminUsers } from "./admin-users.functions";
import type { UserFilters } from "./admin-user-rules";

export const adminUsersQuery = (filters: UserFilters) => queryOptions({
  queryKey: ["admin-users", filters], queryFn: () => getAdminUsers({ data: filters }), staleTime: 15000,
});
