import { Navigate, useParams } from "react-router";
import { InvoiceMonthPage } from "./InvoiceMonthPage";

export function AdminUserInvoiceMonthPage() {
  const { userId } = useParams();

  if (!userId) {
    return <Navigate to="/" replace />;
  }

  return <InvoiceMonthPage forcedUserId={userId} />;
}
