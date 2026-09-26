import { AuthLayout } from '@rhino-automotive-glass/auth-ui'

export default function AuthRootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AuthLayout
      backgroundImage="/parabrisas-medallones-van-camioneta-autobuses.webp"
      backgroundAlt="Rhino Automotive Glass"
      title="Rhino Access"
      subtitle="User & Permission Management"
    >
      {children}
    </AuthLayout>
  )
}
