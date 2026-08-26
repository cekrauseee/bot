import { useCallback, useState, type FormEvent } from 'react'

export function useLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isPasswordVisible, setIsPasswordVisible] = useState(false)

  const togglePasswordVisibility = useCallback(() => {
    setIsPasswordVisible((isVisible) => !isVisible)
  }, [])

  const handleSubmit = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  }, [])

  return {
    email,
    handleSubmit,
    isPasswordVisible,
    password,
    setEmail,
    setPassword,
    togglePasswordVisibility,
  }
}
