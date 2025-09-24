import { writable } from 'svelte/store';

interface ToastMessage {
    message: string;
    type: 'info' | 'success' | 'error';
    id: number;
}

const { subscribe, update } = writable<ToastMessage[]>([]);

function showToast(message: string, type: 'info' | 'success' | 'error' = 'info', duration = 3000) {
    const id = Date.now();
    update(toasts => [...toasts, { message, type, id }]);
    setTimeout(() => dismissToast(id), duration);
}

function dismissToast(id: number) {
    update(toasts => toasts.filter(t => t.id !== id));
}

export const toast = {
    subscribe,
    show: showToast,
    dismiss: dismissToast,
    info: (msg: string, dur?: number) => showToast(msg, 'info', dur),
    success: (msg: string, dur?: number) => showToast(msg, 'success', dur),
    error: (msg: string, dur?: number) => showToast(msg, 'error', dur),
}
