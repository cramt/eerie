import React from 'react'
import { useToastStore } from '../../store/toastStore'
import styles from './Toast.module.css'

export default function ToastContainer() {
  const { toasts, removeToast } = useToastStore()
  if (toasts.length === 0) return null

  return (
    <div className={styles.container}>
      {toasts.map((toast) => (
        <div key={toast.id} className={`${styles.toast} ${styles[toast.kind]}`}>
          <span className={styles.message}>{toast.message}</span>
          <button className={styles.dismiss} onClick={() => removeToast(toast.id)} title="Dismiss">
            &times;
          </button>
        </div>
      ))}
    </div>
  )
}
