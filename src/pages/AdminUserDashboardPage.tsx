import { Navigate, useParams } from "react-router";
import { DashboardPage } from "./DashboardPage";

export function AdminUserDashboardPage() {
  const { userId } = useParams();

  if (!userId) {
    return <Navigate to="/" replace />;
  }

  return <DashboardPage forcedUserId={userId} showBackToUsers />;
}
