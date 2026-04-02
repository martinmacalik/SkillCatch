type PageHeaderProps = {
  title: string
  subtitle?: string
}

export function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
      {subtitle ? <p className="text-sm text-zinc-400 sm:text-base">{subtitle}</p> : null}
    </header>
  )
}
