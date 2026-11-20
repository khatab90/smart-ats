import { t } from "../i18n";
/** Maps Supabase / RPC errors to clear Arabic messages. */
const CODES: Record<string, string> = {
  DEVICE_NOT_FOUND: t("لا يوجد جهاز بهذا المعرّف. تأكد من Device ID المطبوع على البورد."),
  INVALID_PIN: t("رمز PIN غير صحيح."),
  TOO_MANY_ATTEMPTS: t("محاولات خاطئة كثيرة. أعد المحاولة بعد 15 دقيقة."),
  CLAIMED_BY_OTHER: t("هذا الجهاز مسجّل لحساب آخر. يجب على مالكه الحالي إزالته أولاً."),
  ALREADY_YOURS: t("هذا الجهاز مضاف إلى حسابك بالفعل."),
  ENVIRONMENT_MISMATCH: t("هذا الجهاز مخصص لبيئة الاختبار ولا يمكن إضافته في نسخة التشغيل."),
  NAME_REQUIRED: t("أدخل اسماً للجهاز."),
  NOT_ADMIN: t("هذه العملية متاحة للمسؤول فقط."),
  NOT_OWNER: t("هذه العملية متاحة لمالك الجهاز فقط."),
  DEVICE_OFFLINE: t("البورد غير متصل حالياً، لا يمكن إرسال الأوامر."),
  INVALID_PAYLOAD: t("بيانات الأمر غير صالحة."),
  CANNOT_CHANGE_OWNER: t("لا يمكن تغيير صلاحية مالك الجهاز."),
  CANNOT_REMOVE_OWNER: t("لا يمكن إزالة مالك الجهاز."),
  OWNER_CANNOT_LEAVE: t("المالك لا يستطيع المغادرة. انقل الملكية أولاً أو أزل الجهاز."),
  TARGET_NOT_ADMIN: t("يجب أن يكون المستخدم مسؤولاً قبل نقل الملكية إليه."),
  MEMBER_NOT_FOUND: t("المستخدم غير موجود في قائمة هذا الجهاز."),
  ALREADY_MEMBER: t("هذا المستخدم لديه وصول إلى الجهاز بالفعل."),
  INVALID_EMAIL: t("صيغة البريد الإلكتروني غير صحيحة."),
  INVITATION_INVALID: t("رابط الدعوة غير صالح."),
  INVITATION_CLOSED: t("هذه الدعوة استُخدمت أو أُلغيت."),
  INVITATION_EXPIRED: t("انتهت صلاحية الدعوة. اطلب من المسؤول إعادة إرسالها."),
  INVITATION_EMAIL_MISMATCH: t(
    "هذه الدعوة مرسلة إلى بريد إلكتروني آخر. سجّل الدخول بالبريد المدعو.",
  ),
  NOT_AUTHENTICATED: t("يجب تسجيل الدخول أولاً."),
  NOT_MEMBER: t("لا تملك وصولاً إلى هذا الجهاز."),
  INVALID_COMMAND: t("هذا الأمر غير مدعوم."),
  COMMAND_ID_CONFLICT: t("تعارض في معرّف الأمر. أعد المحاولة."),
};

const AUTH: [RegExp, string][] = [
  [/invalid login credentials/i, t("البريد الإلكتروني أو كلمة المرور غير صحيحة.")],
  [/email not confirmed/i, t("لم يتم تأكيد البريد الإلكتروني بعد. افتح رابط التأكيد المرسل إليك.")],
  [/user already registered/i, t("يوجد حساب مسجّل بهذا البريد الإلكتروني.")],
  [/password should be at least/i, t("كلمة المرور قصيرة جداً.")],
  [
    /rate limit|too many requests|security purposes/i,
    t("طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة."),
  ],
  [/token has expired|otp.*(expired|invalid)|invalid.*otp/i, t("الرمز غير صحيح أو انتهت صلاحيته.")],
  [/same.*password|different from the old/i, t("كلمة المرور الجديدة يجب أن تختلف عن الحالية.")],
  [/check constraint/i, t("إحدى القيم خارج النطاق المسموح.")],
  [/permission denied|row-level security/i, t("لا تملك صلاحية تنفيذ هذه العملية.")],
  [
    /failed to fetch|network|load failed|fetch failed/i,
    t("تعذر الاتصال بقاعدة البيانات. تحقق من الإنترنت ثم أعد المحاولة."),
  ],
  [
    /relation .* does not exist|could not find the (function|table)|schema cache/i,
    t("قاعدة البيانات غير مهيأة بعد. شغّل ملف الترحيل في Supabase."),
  ],
];

export function errorMessage(err: unknown): string {
  const msg =
    typeof err === "string"
      ? err
      : err && typeof err === "object" && "message" in err
        ? String((err as { message: unknown }).message)
        : "";
  for (const code of Object.keys(CODES)) {
    if (msg.includes(code)) return CODES[code];
  }
  for (const [re, text] of AUTH) if (re.test(msg)) return text;
  return msg ? t("حدث خطأ غير متوقع: {0}", { 0: msg }) : t("حدث خطأ غير متوقع.");
}

/**
 * Why a startup query failed, if it is the server's shape and not the network:
 * "missing" — the app's tables are not there (an empty or broken project);
 * "outdated" — the tables are there but differ from what this app expects
 * (a column or function it uses is gone): the installed app is too old.
 */
export function schemaProblem(err: unknown): "missing" | "outdated" | null {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : "";
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  if (
    code === "42703" ||
    code === "PGRST204" ||
    /column .* does not exist|could not find the .* column/i.test(msg)
  )
    return "outdated";
  if (code === "PGRST202" || /could not find the function/i.test(msg)) return "outdated";
  if (
    code === "PGRST205" ||
    code === "42P01" ||
    /relation .* does not exist|schema cache/i.test(msg)
  )
    return "missing";
  return null;
}
