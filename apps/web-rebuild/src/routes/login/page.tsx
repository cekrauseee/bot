import { Navigate, useLocation } from "react-router-dom"

export default function LoginPage() {
  const location = useLocation()

  return (
    <Navigate to={{ pathname: "/sign", search: location.search }} replace />
  )
}
