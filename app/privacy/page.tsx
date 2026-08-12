import type { Metadata } from "next";
import Link from "next/link";

import { getPublicSupportEmail, getSupportMailto } from "@/lib/constants/support";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getServerAppLocale();
  const legal = getMessages(locale).legal;
  return {
    title: `${legal.privacyTitle} · SideSeat`,
    description: legal.privacyMetaDescription,
  };
}

export default async function PrivacyPage() {
  const locale = await getServerAppLocale();
  const legal = getMessages(locale).legal;
  const zh = locale === "zh-CN";
  const supportEmail = getPublicSupportEmail();
  const supportMailto = getSupportMailto();

  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-5 py-10 text-foreground">
      <p className="text-[13px] font-medium text-muted-foreground">
        <Link href="/" className="underline-offset-2 hover:underline">
          SideSeat
        </Link>
      </p>
      <h1 className="mt-3 text-2xl font-semibold tracking-tight">{legal.privacyTitle}</h1>
      <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground">
        {zh
          ? "SideSeat 帮助同学围绕真实课表协作。在你主动交换之前，我们会保护联系方式隐私，也不会出售个人数据。"
          : "SideSeat helps classmates coordinate around real schedules. We keep contact details private until you choose to exchange them, and we do not sell personal data."}
      </p>

      <section className="mt-8 space-y-6 text-[14px] leading-relaxed text-foreground/90">
        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">{zh ? "我们收集哪些信息" : "What we collect"}</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-foreground/90">
            <li>
              <span className="font-medium">{zh ? "联系信息" : "Contact info"}</span>
              {zh
                ? " — 用户名；用于登录与账户找回的可选邮箱和/或手机号。"
                : " — username; optional email and/or phone used for sign-in and account recovery."}
            </li>
            <li>
              <span className="font-medium">{zh ? "资料与学业信息" : "Profile & academics"}</span>
              {zh
                ? " — 昵称、简介、头像、生活照，以及你选择分享的学校相关字段（如专业、学期、语言、城市）。学校认证优先使用学校邮箱；无法使用学校邮箱时，你可以自愿提交经过遮挡的在读或毕业材料。"
                : " — nickname, bio, avatar, life photos, and school-related fields you choose to share (for example major, semester, languages, city). School verification uses a school email first; if that is unavailable, you may voluntarily submit a redacted enrollment or graduation document."}
            </li>
            <li>
              <span className="font-medium">{zh ? "用户内容" : "User content"}</span>
              {zh
                ? " — 消息、计划、日程分享、发现页帖子与活动、你创建或导入的日历日程，以及你提交的举报。"
                : " — messages, plans, schedule shares, Discover posts and activities, calendar events you create or import, and reports you submit."}
            </li>
            <li>
              <span className="font-medium">{zh ? "标识符" : "Identifiers"}</span>
              {zh
                ? " — 账户 ID；你允许通知时的设备推送令牌；用于保持登录的会话令牌。"
                : " — account ID; device push token when you allow notifications; session tokens to keep you signed in."}
            </li>
            <li>
              <span className="font-medium">{zh ? "位置" : "Location"}</span>
              {zh
                ? " — 仅当你在聊天中主动分享位置时（大致或精确，取决于你发送的内容）。我们不会在后台持续追踪位置。"
                : " — only when you explicitly share a location in chat (approximate or precise, depending on what you send). We do not continuously track your location in the background."}
            </li>
            <li>
              <span className="font-medium">{zh ? "诊断信息" : "Diagnostics"}</span>
              {zh
                ? " — 若生产构建配置了 Sentry，可能包含崩溃与性能诊断。默认个人身份信息上传已关闭；我们不使用第三方广告追踪器。"
                : " — crash and performance diagnostics when Sentry is configured for a production build. Default PII transmission is disabled, and we do not use third-party advertising trackers."}
            </li>
          </ul>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">{zh ? "我们如何使用" : "How we use it"}</h2>
          <p>
            {zh
              ? "用于运营 SideSeat：身份验证、校内同学发现、聊天、日历协作、可选推送通知、学生认证、应用内反馈，以及（如启用）通过 Apple 或 Stripe 的可选打赏。我们使用这些数据提供你请求的功能，并维护社区安全（屏蔽、举报、防滥用）。"
              : "To operate SideSeat: authentication, classmate discovery within your school, chat, calendar coordination, optional push notifications, student verification, in-app feedback, and (if enabled) optional tips via Apple or Stripe. We use the data to provide the features you request and to keep the community safe (blocks, reports, abuse prevention)."}
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">
            {zh ? "处理方与子处理方" : "Processors & subprocessors"}
          </h2>
          <p>
            {zh
              ? "根据服务器启用的功能，我们可能使用："
              : "Depending on which features are enabled on the server, we may use:"}
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium">{zh ? "托管与数据库" : "Hosting & database"}</span>
              {zh
                ? " — 应用托管、私有文件存储与托管 Postgres（例如 Vercel 与 Neon）以运行服务。"
                : " — application hosting, private object storage, and managed Postgres (for example Vercel and Neon) to run the service."}
            </li>
            <li>
              <span className="font-medium">{zh ? "邮件" : "Email"}</span>
              {zh
                ? " — Resend，用于验证与账户找回验证码。"
                : " — Resend for verification and account-recovery codes."}
            </li>
            <li>
              <span className="font-medium">SMS</span>
              {zh
                ? " — 启用手机 OTP 时使用 Twilio（或同等服务商）。"
                : " — Twilio (or an equivalent provider) when phone OTP is enabled."}
            </li>
            <li>
              <span className="font-medium">
                {zh ? "AI 日程解析" : "AI schedule parsing"}
              </span>
              {zh
                ? " — 当你使用自然语言日历建议时，会调用阿里云 DashScope / 通义千问；你为此功能提交的提示文本会发送给服务商以生成日程草稿。"
                : " — Alibaba DashScope / 通义千问 when you use natural-language calendar suggestions; prompt text you submit for that feature is sent to the provider to generate event drafts."}
            </li>
            <li>
              <span className="font-medium">{zh ? "端侧识别" : "On-device recognition"}</span>
              {zh
                ? " — 语音日程转写仅在设备支持端侧识别时运行；课表截图文字识别使用 Apple Vision 在设备上完成。音频与用于识别的截图不会为这些识别步骤上传到我们的服务器。"
                : " — calendar voice transcription runs only when on-device recognition is available, and timetable screenshot text recognition uses Apple Vision on device. Audio and recognition screenshots are not uploaded to our servers for those recognition steps."}
            </li>
            <li>
              <span className="font-medium">Sentry</span>
              {zh
                ? " — 在生产构建启用时，用于处理不与账户关联的崩溃和性能诊断。"
                : " — when enabled for production builds, processes crash and performance diagnostics that are not linked to an account."}
            </li>
            <li>
              <span className="font-medium">{zh ? "支付" : "Payments"}</span>
              {zh
                ? " — 网页可选打赏使用 Stripe；启用应用内打赏时使用 Apple StoreKit。"
                : " — Stripe for optional web tips; Apple for optional in-app StoreKit tips when that feature is enabled."}
            </li>
            <li>
              <span className="font-medium">{zh ? "推送送达" : "Push delivery"}</span>
              {zh
                ? " — Apple Push Notification service（APNs），用于投递你在 iOS 上选择接收的通知。"
                : " — Apple Push Notification service (APNs) to deliver notifications you opt into on iOS."}
            </li>
          </ul>
          <p>
            {zh
              ? "上述服务商仅按我们的指示、为提供对应功能而处理数据。"
              : "These providers process data only to deliver the corresponding feature under our instructions."}
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">{zh ? "保留期限" : "Retention"}</h2>
          <p>
            {zh
              ? "账户与资料数据在账户有效期间保留。学校认证材料会在审核完成、你重新提交或删除账户时删除；未完成审核的材料最迟在上传 30 天后删除。我们只保留认证结果、学校、认证方式与时间。聊天实时变更事件会在送达后按较短滚动窗口清理；消息历史遵循你参与会话的产品保留策略。删除账户后，我们会从活跃系统中移除个人资料数据，但在法律、安全或备份要求下可能有限保留。"
              : "Account and profile data are kept while your account is active. School verification documents are deleted after review, when replaced, or when you delete your account; unreviewed documents are deleted no later than 30 days after upload. We retain only the verification result, school, method, and timestamps. Chat realtime change events are pruned on a short rolling window after delivery; message history follows product retention for conversations you participate in. After you delete your account, we remove personal profile data from active systems, subject to limited legal, security, or backup retention where required."}
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">
            {zh ? "Cookie 与本地存储" : "Cookies & local storage"}
          </h2>
          <p>
            {zh
              ? "网页端使用会话 Cookie（及类似存储）保持登录并记住偏好。iOS 应用会在设备上安全存储会话凭证（例如钥匙串），并可能保存本地偏好（如发现页城市）。我们不使用广告 Cookie。"
              : "The web app uses session cookies (and similar storage) to keep you signed in and to remember preferences. The iOS app stores session credentials securely on device (for example Keychain) and may store local preferences such as Discover city. We do not use advertising cookies."}
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">{zh ? "儿童" : "Children"}</h2>
          <p>
            {zh
              ? "SideSeat 面向大学生同学，不以 13 岁以下儿童为目标用户。我们不会故意收集 13 岁以下儿童的个人信息。若你认为儿童提供了数据，请联系我们，我们会予以删除。"
              : "SideSeat is intended for university classmates and is not directed at children under 13. We do not knowingly collect personal information from children under 13. If you believe a child has provided data, contact us and we will delete it."}
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">{zh ? "你的控制权" : "Your controls"}</h2>
          <p>
            {zh ? (
              <>
                你可以编辑资料与隐私设置、屏蔽用户、举报内容、在 iOS 设置中管理通知权限，并从{" "}
                <span className="font-medium">我的 → 设置</span>
                （或对应网页账户页）删除账户。删除账户会按上文所述从活跃系统中移除个人资料数据。
              </>
            ) : (
              <>
                You can edit profile and privacy settings, block users, report content, manage
                notification permission in iOS Settings, and delete your account from{" "}
                <span className="font-medium">Me → Settings</span> (or the equivalent web account
                page). Deleting an account removes your personal profile data from active systems as
                described above.
              </>
            )}
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">
            {zh ? "App Store 隐私标签" : "App Store privacy labels"}
          </h2>
          <p>
            {zh
              ? "在 App Store 产品页，我们声明与你关联、且与上述类别一致的数据（联系信息、用户内容、标识符，以及你分享时的位置）。我们不会为广告目的跨其他公司的应用与网站追踪你。"
              : "On the App Store product page we declare data linked to you that matches the categories above (contact info, user content, identifiers, and location when you share it). We do not track you across apps and websites owned by other companies for advertising."}
          </p>
        </div>

        <div className="space-y-2">
          <h2 className="text-[16px] font-semibold">{zh ? "联系我们" : "Contact"}</h2>
          <p>
            {supportEmail && supportMailto ? (
              <>
                {zh ? "隐私相关问题：" : "Privacy questions:"}{" "}
                <a className="underline underline-offset-2" href={supportMailto}>
                  {supportEmail}
                </a>
                {zh ? "。" : ". "}
              </>
            ) : null}
            {zh ? "支持页面：" : "Support page:"}{" "}
            <Link href="/support" className="underline underline-offset-2">
              /support
            </Link>
            .
          </p>
        </div>
      </section>
      <p className="mt-10 text-[12px] text-muted-foreground">
        {zh ? "最近更新：2026 年 8 月" : "Last updated: August 2026"}
      </p>
    </main>
  );
}
