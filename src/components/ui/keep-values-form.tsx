"use client";

import { useTransition, type ComponentProps, type Ref } from "react";

/**
 * A form for useActionState that keeps what the person typed. With `<form action={fn}>`, React
 * resets the fields after every submission, also when the server answers with an error, and the
 * person would have to type everything again. Forms that should clear after saving do it themselves.
 */
export function KeepValuesForm({
  action,
  ref,
  ...props
}: Omit<ComponentProps<"form">, "action" | "onSubmit"> & {
  action: (formData: FormData) => void;
  ref?: Ref<HTMLFormElement>;
}) {
  const [, startTransition] = useTransition();
  return (
    <form
      {...props}
      ref={ref}
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget, (event.nativeEvent as SubmitEvent).submitter);
        startTransition(() => action(formData));
      }}
    />
  );
}
