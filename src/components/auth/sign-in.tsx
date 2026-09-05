"use client"

import {
  authMutationKeys,
  validateEmailAddress,
  validateStringLength
} from "@better-auth-ui/core"
import {
  isPasskeyAutoFillEnabled,
  withPasskeyAutoFill
} from "@better-auth-ui/core/plugins/passkey"
import {
  AuthPrompts,
  useAuth,
  useFetchOptions,
  useSignInEmail
} from "@better-auth-ui/react"
import { useIsMutating } from "@tanstack/react-query"
import { Eye, EyeOff } from "lucide-react"
import { SecurityLockIcon, AlertCircleIcon } from "hugeicons-react"
import { useState } from "react"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useSignInContinuation } from "@/lib/auth/use-sign-in-continuation"
import { cn } from "@/lib/utils"
import { isAuthFormFieldInvalid, useAuthForm } from "./auth-form"
import { LastUsedBadge } from "./last-login-method/last-used-badge"
import { ProviderButtons, type SocialLayout } from "./provider-buttons"

export type SignInProps = {
  className?: string
  socialLayout?: SocialLayout
  socialPosition?: "top" | "bottom"
}

/**
 * Render the sign-in form UI with email/password, magic link, and social provider options.
 *
 * @param className - Optional additional container class names
 * @param socialLayout - Layout style for social provider buttons
 * @param socialPosition - Position of social provider buttons; `"top"` or `"bottom"`. Defaults to `"bottom"`.
 * @returns The rendered sign-in UI as a JSX element
 */
export function SignIn({
  className,
  socialLayout,
  socialPosition = "bottom"
}: SignInProps) {
  const {
    authClient,
    basePaths,
    emailAndPassword,
    localization,
    plugins,
    socialProviders,
    viewPaths,
    navigate,
    Link
  } = useAuth()

  const { fetchOptions, resetFetchOptions } = useFetchOptions()
  const continueSignIn = useSignInContinuation()

  const [authError, setAuthError] = useState<string | null>(null)
  const { mutate: signInEmail, isPending: signInEmailPending } = useSignInEmail(
    authClient,
    {
      onError: (error, { email }) => {
        form.setFieldValue("password", "")
        setAuthError(error.error?.message || "Failed to sign in. Please check your credentials.")

        if (error.error?.code === "EMAIL_NOT_VERIFIED") {
          sessionStorage.setItem("better-auth-ui.verify-email", email)
          navigate({
            to: `${basePaths.auth}/${viewPaths.auth.verifyEmail}`
          })
        }

        resetFetchOptions()
      },
      onSuccess: (data) => {
        setAuthError(null)
        continueSignIn(data)
      }
    }
  )

  const signInMutating = useIsMutating({
    mutationKey: authMutationKeys.signIn.all
  })
  const signUpMutating = useIsMutating({
    mutationKey: authMutationKeys.signUp.all
  })
  const isPending = signInMutating + signUpMutating > 0

  const Captcha = plugins.find(
    (plugin) => plugin.captchaComponent
  )?.captchaComponent

  const passkeyAutoFill = isPasskeyAutoFillEnabled(plugins)

  const [isPasswordVisible, setIsPasswordVisible] = useState(false)
  const form = useAuthForm({
    defaultValues: { email: "", password: "", rememberMe: false },
    onSubmit: ({ value }) => {
      setAuthError(null)
      signInEmail({
        email: value.email,
        password: value.password,
        ...(emailAndPassword?.rememberMe
          ? { rememberMe: value.rememberMe }
          : {}),
        fetchOptions
      })
    }
  })

  const showSeparator =
    emailAndPassword?.enabled && socialProviders && socialProviders.length > 0

  return (
    <Card className={cn("w-full max-w-sm bg-[#131211] border-white/[0.08] text-white", className)}>
      <AuthPrompts view="signIn" />
      <CardHeader className="text-center space-y-1.5 pb-2">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-[#ffe633]/10 text-[#ffe633] mb-2 mx-auto border border-[#ffe633]/20">
          <SecurityLockIcon size={20} strokeWidth={1.5} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Welcome to Joey
        </h1>
        <p className="text-xs text-white/50">
          Autonomous social media agent &amp; editorial studio
        </p>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col gap-6">
          {socialPosition === "top" && (
            <>
              {socialProviders && socialProviders.length > 0 && (
                <ProviderButtons socialLayout={socialLayout} view="signIn" />
              )}

              {showSeparator && (
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card m-0 text-xs flex items-center">
                  {localization.auth.or}
                </FieldSeparator>
              )}
            </>
          )}

          {emailAndPassword?.enabled && (
            <form.AppForm>
              <form.AuthFormRoot>
                <FieldGroup>
                  {authError && (
                    <div className="flex items-center gap-2 p-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <AlertCircleIcon size={16} className="shrink-0" />
                      <span>{authError}</span>
                    </div>
                  )}

                  <form.AppField
                    name="email"
                    validators={{
                      onChange: ({ value }) =>
                        validateEmailAddress(value, {
                          invalidMessage: localization.auth.invalidEmail,
                          requiredMessage: localization.auth.fieldRequired
                        })
                    }}
                  >
                    {(field) => {
                      const isInvalid = isAuthFormFieldInvalid(field.state.meta)
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor="email">
                            {localization.auth.email}
                          </FieldLabel>

                          <Input
                            id="email"
                            name={field.name}
                            type="email"
                            autoComplete={withPasskeyAutoFill(
                              "email",
                              passkeyAutoFill
                            )}
                            placeholder={localization.auth.emailPlaceholder}
                            required
                            disabled={isPending}
                            value={field.state.value}
                            onBlur={field.handleBlur}
                            onChange={(event) =>
                              field.handleChange(event.target.value)
                            }
                            aria-invalid={isInvalid}
                          />
                          <field.AuthFormFieldError />
                        </Field>
                      )
                    }}
                  </form.AppField>

                  <form.AppField
                    name="password"
                    validators={{
                      onChange: ({ value }) =>
                        validateStringLength(value, {
                          maxLength: emailAndPassword?.maxPasswordLength,
                          maxLengthMessage: localization.auth.tooLong.replace(
                            "{{max}}",
                            String(emailAndPassword?.maxPasswordLength)
                          ),
                          minLength: emailAndPassword?.minPasswordLength,
                          minLengthMessage: localization.auth.tooShort.replace(
                            "{{min}}",
                            String(emailAndPassword?.minPasswordLength)
                          ),
                          requiredMessage: localization.auth.fieldRequired
                        })
                    }}
                  >
                    {(field) => {
                      const isInvalid = isAuthFormFieldInvalid(field.state.meta)
                      return (
                        <Field data-invalid={isInvalid}>
                          <FieldLabel htmlFor="password">
                            {localization.auth.password}
                          </FieldLabel>

                          <InputGroup>
                            <InputGroupInput
                              id="password"
                              name={field.name}
                              type={isPasswordVisible ? "text" : "password"}
                              autoComplete={withPasskeyAutoFill(
                                "current-password",
                                passkeyAutoFill
                              )}
                              value={field.state.value}
                              onBlur={field.handleBlur}
                              onChange={(event) =>
                                field.handleChange(event.target.value)
                              }
                              placeholder={
                                localization.auth.passwordPlaceholder
                              }
                              required
                              minLength={emailAndPassword?.minPasswordLength}
                              maxLength={emailAndPassword?.maxPasswordLength}
                              disabled={isPending}
                              aria-invalid={isInvalid}
                            />

                            <InputGroupAddon align="inline-end">
                              <InputGroupButton
                                size="icon-xs"
                                aria-label={
                                  isPasswordVisible
                                    ? localization.auth.hidePassword
                                    : localization.auth.showPassword
                                }
                                title={
                                  isPasswordVisible
                                    ? localization.auth.hidePassword
                                    : localization.auth.showPassword
                                }
                                onClick={() => {
                                  setIsPasswordVisible((visible) => !visible)
                                }}
                              >
                                {isPasswordVisible ? <EyeOff /> : <Eye />}
                              </InputGroupButton>
                            </InputGroupAddon>
                          </InputGroup>

                          <field.AuthFormFieldError />
                        </Field>
                      )
                    }}
                  </form.AppField>

                  {emailAndPassword.rememberMe && (
                    <form.AppField name="rememberMe">
                      {(field) => (
                        <Field className="my-1">
                          <div className="flex items-center gap-3">
                            <Checkbox
                              id="rememberMe"
                              name={field.name}
                              checked={field.state.value}
                              disabled={isPending}
                              onCheckedChange={(checked) =>
                                field.handleChange(checked === true)
                              }
                            />

                            <FieldLabel
                              htmlFor="rememberMe"
                              className="cursor-pointer text-sm font-normal"
                            >
                              {localization.auth.rememberMe}
                            </FieldLabel>
                          </div>
                        </Field>
                      )}
                    </form.AppField>
                  )}

                  {Captcha && (
                    <div className="flex justify-center">{Captcha}</div>
                  )}

                  <div className="flex flex-col gap-3">
                    <form.AuthFormSubmitButton
                      className="relative overflow-visible"
                      disabled={isPending}
                    >
                      {signInEmailPending && <Spinner />}

                      {localization.auth.signIn}

                      <LastUsedBadge method="email" floating />
                    </form.AuthFormSubmitButton>

                    {plugins.flatMap((plugin) =>
                      (plugin.authButtons ?? []).map((AuthButton, index) => (
                        <AuthButton
                          key={`${plugin.id}-${index.toString()}`}
                          view="signIn"
                        />
                      ))
                    )}
                  </div>
                </FieldGroup>
              </form.AuthFormRoot>
            </form.AppForm>
          )}

          {socialPosition === "bottom" && (
            <>
              {showSeparator && (
                <FieldSeparator className="*:data-[slot=field-separator-content]:bg-card text-xs flex items-center">
                  {localization.auth.or}
                </FieldSeparator>
              )}

              {socialProviders && socialProviders.length > 0 && (
                <ProviderButtons socialLayout={socialLayout} view="signIn" />
              )}
            </>
          )}
        </div>

        <div className="flex flex-col gap-3 items-center w-full mt-4">
          {emailAndPassword?.enabled && emailAndPassword?.forgotPassword && (
            <Link
              href={`${basePaths.auth}/${viewPaths.auth.forgotPassword}`}
              className="self-center text-sm underline-offset-4 hover:underline"
            >
              {localization.auth.forgotPasswordLink}
            </Link>
          )}

          {emailAndPassword?.enabled && (
            <FieldDescription className="text-center">
              {localization.auth.needToCreateAnAccount}{" "}
              <Link
                href={`${basePaths.auth}/${viewPaths.auth.signUp}`}
                className="underline underline-offset-4"
              >
                {localization.auth.signUp}
              </Link>
            </FieldDescription>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
