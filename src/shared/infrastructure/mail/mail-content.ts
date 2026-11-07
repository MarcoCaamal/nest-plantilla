import type { TransactionalMail } from '@/shared/application/ports/mail-sender.port';

/** Plain text avoids remote content and HTML injection; link origin from validated config. */
export function renderMail(message: TransactionalMail, origin: string): { subject: string; text: string } {
  switch (message.kind) {
    case 'VERIFY_EMAIL':
      return {
        subject: 'Verifica tu correo',
        text: 'Abre este enlace para verificar tu correo (vence en 24 horas): ' +
          new URL('/verify-email?token=' + encodeURIComponent(message.token), origin).toString(),
      };
    case 'RESET_PASSWORD':
      return {
        subject: 'Restablece tu contraseña',
        text: 'Abre este enlace para cambiar tu contraseña (vence en 1 hora): ' +
          new URL('/reset-password?token=' + encodeURIComponent(message.token), origin).toString(),
      };
    case 'WELCOME':
      return { subject: 'Bienvenido', text: 'Tu cuenta se ha creado correctamente.' };
  }
}
