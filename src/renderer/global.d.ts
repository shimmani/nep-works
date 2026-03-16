import type { NepAPI } from '../preload/index'

declare global {
  interface Window {
    api: NepAPI
  }
}
