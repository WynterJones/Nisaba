import { useEffect, useState } from 'react'

export default function App(): React.JSX.Element {
  const [version, setVersion] = useState('')

  useEffect(() => {
    window.api.getVersion().then(setVersion)
  }, [])

  return (
    <main>
      <h1>Nisaba</h1>
      <p>v{version}</p>
    </main>
  )
}
