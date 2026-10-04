// What a notification says and where it leads: shared by the bell dropdown (components.js, App Nav)
// and the full page (pages/notifiche.js).

export const notificationInitials = n => (n || '?').split(' ').map(w => w[0]).join('').slice(0, 2);

export function describeNotification(n) {
  const who = n.actor?.name || 'Un membro';
  switch (n.kind) {
    case 'connection_request': return { who, rest: ' vuole entrare in contatto con te.', href: '/connessioni?tab=ricevute' };
    case 'connection_accepted': return { who, rest: ' ha accettato la tua richiesta.', href: `/persone/${n.actor?.id}` };
    case 'message': return { who, rest: ' ti ha inviato un messaggio.', href: `/messaggi/${n.actor?.id}` };
    case 'group_post': return {
      who, rest: ` ha pubblicato in ${n.data.group_name || 'un gruppo'}.`, href: `/gruppi/${n.data.group_id}#post-${n.data.post_id}`,
    };
    case 'group_comment': return {
      who, rest: ` ha commentato ${n.data.own ? 'il tuo post' : 'un post che segui'} in ${n.data.group_name || 'un gruppo'}.`,
      href: `/gruppi/${n.data.group_id}#post-${n.data.post_id}`,
    };
    default: return { text: 'Aggiornamento dal team Rientro.', icon: 'i', ibg: '#EFEBFF', ifg: '#3E2BA8', href: null };
  }
}
