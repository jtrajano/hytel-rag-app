interface HeaderProps {
  title: string
}

export function Header({ title }: HeaderProps) {
  return (
    <header className="text-center py-8">
      <h1 className="text-4xl font-bold text-blue-600 dark:text-blue-400">{title}</h1>
    </header>
  )
}
