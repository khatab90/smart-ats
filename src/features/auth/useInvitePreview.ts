import { useEffect, useState } from "react";
import { previewInvitation, type InvitationPreview } from "../../api/members";
import { clearPendingInvite, usePendingInvite } from "../../store/invite";

/**
 * The invitation this phone opened a link for, as the sign-in screen needs
 * it: who invited which email to which system. A link that is no longer
 * usable (accepted, revoked, expired, unknown) is forgotten.
 */
export function useInvitePreview(): InvitationPreview | null {
  const token = usePendingInvite();
  const [preview, setPreview] = useState<{ token: string; info: InvitationPreview } | null>(null);
  useEffect(() => {
    if (!token) return;
    let live = true;
    void previewInvitation(token).then(({ data }) => {
      if (!live || !data) return;
      if (data.status !== "pending") clearPendingInvite();
      else setPreview({ token, info: data });
    });
    return () => {
      live = false;
    };
  }, [token]);
  return token && preview?.token === token ? preview.info : null;
}
