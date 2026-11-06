import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { MemoryRouter } from "react-router";
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

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts. Please wait before trying again.");

    rerender(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("We could not reach the server.");
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

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const busy = await screen.findByRole("button", { name: /Signing in/ });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute("aria-busy", "true");
    release?.();
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

test("validation failures are reported without a network round trip", async () =>
{
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockRejectedValue(failure(422, "VALIDATION_ERROR", "Validation failed"));
    render(<MemoryRouter><LoginForm onSubmit={onSubmit} /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid email address and password.");
});