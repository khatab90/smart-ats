/** Maps Supabase / RPC errors to clear Arabic messages. */
const CODES: Record<string, string> = {
  DEVICE_NOT_FOUND: "لا يوجد جهاز بهذا المعرّف. تأكد من Device ID المطبوع على البورد.",
  INVALID_PIN: "رمز PIN غير صحيح.",
  TOO_MANY_ATTEMPTS: "محاولات خاطئة كثيرة. أعد المحاولة بعد 15 دقيقة.",
  CLAIMED_BY_OTHER: "هذا الجهاز مسجّل لحساب آخر. يجب على مالكه الحالي إزالته أولاً.",
  ALREADY_YOURS: "هذا الجهاز مضاف إلى حسابك بالفعل.",
  ENVIRONMENT_MISMATCH: "هذا الجهاز مخصص لبيئة الاختبار ولا يمكن إضافته في نسخة التشغيل.",
  NAME_REQUIRED: "أدخل اسماً للجهاز.",
  NOT_ADMIN: "هذه العملية متاحة للمسؤول فقط.",
  NOT_OWNER: "هذه العملية متاحة لمالك الجهاز فقط.",
  DEVICE_OFFLINE: "البورد غير متصل حالياً، لا يمكن إرسال الأوامر.",
  INVALID_PAYLOAD: "بيانات الأمر غير صالحة.",
  CANNOT_CHANGE_OWNER: "لا يمكن تغيير صلاحية مالك الجهاز.",
  CANNOT_REMOVE_OWNER: "لا يمكن إزالة مالك الجهاز.",
  OWNER_CANNOT_LEAVE: "المالك لا يستطيع المغادرة. انقل الملكية أولاً أو أزل الجهاز.",
  TARGET_NOT_ADMIN: "يجب أن يكون المستخدم مسؤولاً قبل نقل الملكية إليه.",
  MEMBER_NOT_FOUND: "المستخدم غير موجود في قائمة هذا الجهاز.",
  ALREADY_MEMBER: "هذا المستخدم لديه وصول إلى الجهاز بالفعل.",
  INVALID_EMAIL: "صيغة البريد الإلكتروني غير صحيحة.",
  INVITATION_INVALID: "رابط الدعوة غير صالح.",
  INVITATION_CLOSED: "هذه الدعوة استُخدمت أو أُلغيت.",
  INVITATION_EXPIRED: "انتهت صلاحية الدعوة. اطلب من المسؤول إعادة إرسالها.",
  INVITATION_EMAIL_MISMATCH: "هذه الدعوة مرسلة إلى بريد إلكتروني آخر. سجّل الدخول بالبريد المدعو.",
  NOT_AUTHENTICATED: "يجب تسجيل الدخول أولاً.",
};

const AUTH: [RegExp, string][] = [
  [/invalid login credentials/i, "البريد الإلكتروني أو كلمة المرور غير صحيحة."],
  [/email not confirmed/i, "لم يتم تأكيد البريد الإلكتروني بعد. افتح رابط التأكيد المرسل إليك."],
  [/user already registered/i, "يوجد حساب مسجّل بهذا البريد الإلكتروني."],
  [/password should be at least/i, "كلمة المرور قصيرة جداً."],
  [
    /rate limit|too many requests|security purposes/i,
    "طلبات كثيرة خلال وقت قصير. انتظر قليلاً ثم أعد المحاولة.",
  ],
  [
    /phone.*(disabled|provider)|unsupported phone provider|sms/i,
    "التحقق من رقم الهاتف عبر SMS غير مفعّل في الخادم بعد.",
  ],
  [/token has expired|otp.*(expired|invalid)|invalid.*otp/i, "الرمز غير صحيح أو انتهت صلاحيته."],
  [/same.*password|different from the old/i, "كلمة المرور الجديدة يجب أن تختلف عن الحالية."],
  [/check constraint/i, "إحدى القيم خارج النطاق المسموح."],
  [/permission denied|row-level security/i, "لا تملك صلاحية تنفيذ هذه العملية."],
  [
    /failed to fetch|network|load failed|fetch failed/i,
    "تعذر الاتصال بقاعدة البيانات. تحقق من الإنترنت ثم أعد المحاولة.",
  ],
  [
    /relation .* does not exist|could not find the (function|table)|schema cache/i,
    "قاعدة البيانات غير مهيأة بعد. شغّل ملف الترحيل في Supabase.",
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
  return msg ? `حدث خطأ غير متوقع: ${msg}` : "حدث خطأ غير متوقع.";
}

export function isSchemaMissing(err: unknown) {
  const msg =
    err && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : "";
  const code =
    err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
  return (
    code === "PGRST205" ||
    code === "PGRST202" ||
    code === "42P01" ||
    /schema cache|does not exist/i.test(msg)
  );
}
