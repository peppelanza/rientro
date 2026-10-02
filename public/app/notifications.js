// What a notification says and where it leads: shared by the bell dropdown (components.js, App Nav)
// and the full page (pages/notifiche.js).

export const notificationInitials = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2);

export function describeNotification(n) {
  const who = n.actor?.name || 'Un membro';
  switch (n.kind) {
    case 'connection_request': return { who, rest: ' vuole entrare in contatto con te.', href: `/connessioni/${n.data.connection_id}` };
    case 'connection_accepted': return { who, rest: ' ha accettato la tua richiesta.', href: `/messaggi/${n.actor?.id}` };
    case 'message': return { who, rest: n.data.preview ? ` ti ha scritto: “${n.data.preview}”` : ' ti ha scritto.', href: `/messaggi/${n.actor?.id}` };
    default: return { text: 'Aggiornamento dal team Rientro.', icon: 'i', ibg: '#EFEBFF', ifg: '#3E2BA8', href: null };
  }
}
