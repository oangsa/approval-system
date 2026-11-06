import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
import { loginRequestSchema } from "@workflow/contracts";
import { LoginForm } from "../../app/modules/auth/LoginForm";
import { ApiFailure } from "../../app/api/errors";

const failure = (status: number, code: string, message: string) =>
    new ApiFailure({ kind: "http", status, code, message, requestId: "3f1a2b3c-4d5e-4f70-8192-a3b4c5d6e7f8" });

test("login form exposes labeled fields with autocomplete and a password visibility toggle", async () =>
{
    const user = userEvent.setup();
    render(<MemoryRouter><LoginForm onSubmit={vi.fn()} /></MemoryRouter>);

    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    expect(email).toHaveAttribute("type", "email");
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("type", "password");
    expect(password).toHaveAttribute("autocomplete", "current-password");

    const toggle = screen.getByRole("button", { name: "Show password" });
    await user.click(toggle);
    expect(screen.getByLabelText("Password")).toHaveAttribute("type", "text");
    expect(screen.getByRole("button", { name: "Hide password" })).toHaveAttribute("aria-pressed", "true");
});

test("credential failures show a generic message that never reveals whether the account exists", async () =>
{
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(failure(401, "UNAUTHENTICATED", "Authentication required"));
    render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Email or password is incorrect.");
    expect(alert).not.toHaveTextContent("person@example.com");
});

test("rate limiting and network failures surface distinct recoverable messages", async () =>
{
    const user = userEvent.setup();
    const onSubmit = vi.fn()
            .mockRejectedValueOnce(failure(429, "RATE_LIMITED", "Too many requests"))
            .mockRejectedValueOnce(new ApiFailure({ kind: "network", message: "Network request failed" }));
    const { rerender } = render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Please wait before trying again.");
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);
    expect(screen.getByLabelText("Email")).toHaveValue("person@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server.");
    expect(onSubmit).toHaveBeenCalledTimes(2);
});

test("the submit button reports busy state while a sign-in is in flight", async () =>
{
    const user = userEvent.setup();
    let release: (() => void) | undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) =>
    {
        release = resolve;
    }));
    render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const busy = await screen.findByRole("button", { name: /Signing in/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await user.click(busy);
    fireEvent.submit(busy.closest("form")!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    await act(async () =>
    {
        release?.();
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled());
});

test("a successful sign-in submits the entered credentials once", async () =>
{
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ email: "person@example.com", password: "correct-horse" });
});


test.each([400, 422])("server validation %s retains values and permits retry", async (status) =>
{
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(failure(status, "VALIDATION_ERROR", "Validation failed"));
    render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    await user.type(email, "person@example.com");
    await user.type(password, "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address and password.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("could not reach");
    expect(email).toHaveValue("person@example.com");
    expect(password).toHaveValue("correct-horse");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
    expect(onSubmit).toHaveBeenCalledTimes(1);
});

test.each([
    ["empty", "", "", true, true],
    ["invalid email", "invalid", "correct-horse", true, false],
    ["empty password", "person@example.com", "", false, true],
])("local validation: %s", async (_name, emailValue, passwordValue, emailInvalid, passwordInvalid) =>
{
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);
    const email = screen.getByLabelText("Email");
    const password = screen.getByLabelText("Password");
    if (emailValue) await user.type(email, emailValue);
    if (passwordValue) await user.type(password, passwordValue);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(onSubmit).not.toHaveBeenCalled();
    for (const [field, invalid, message] of [[email, emailInvalid, "Enter a valid email address."], [password, passwordInvalid, "Enter a password."]] as const)
    {
        if (invalid)
        {
            expect(field).toHaveAttribute("aria-invalid", "true");
            const error = document.getElementById(field.getAttribute("aria-describedby")!);
            expect(error).toBeVisible();
            expect(error?.textContent).toBe(message);
        }
        else
        {
            expect(field).not.toHaveAttribute("aria-invalid");
            expect(field).not.toHaveAttribute("aria-describedby");
        }
    }
    expect(emailInvalid ? email : password).toHaveFocus();
    expect(email).toHaveValue(emailValue);
    expect(password).toHaveValue(passwordValue);
    expect(screen.queryByText(/could not reach/i)).not.toBeInTheDocument();
    if (emailInvalid && passwordInvalid)
    {
        await user.type(email, "invalid");
        expect(email).not.toHaveAttribute("aria-invalid");
        expect(email).not.toHaveAttribute("aria-describedby");
        expect(password).toHaveAttribute("aria-invalid", "true");
        const passwordError = document.getElementById(password.getAttribute("aria-describedby")!);
        expect(passwordError).toBeVisible();
        expect(passwordError?.textContent).toBe("Enter a password.");
        await user.click(screen.getByRole("button", { name: "Sign in" }));
        expect(email).toHaveAttribute("aria-invalid", "true");
    }
    await user.clear(email);
    await user.type(email, "person@example.com");
    if (!passwordValue) await user.type(password, "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith({ email: "person@example.com", password: "correct-horse" });
});

test("real ZodError is classified as validation", async () =>
{
    const parsed = loginRequestSchema.safeParse({ email: "invalid", password: "" });
    if (parsed.success) throw new Error("Expected invalid credentials");
    const onSubmit = vi.fn().mockRejectedValue(parsed.error);
    const user = userEvent.setup();
    render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address and password.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("could not reach");
});
