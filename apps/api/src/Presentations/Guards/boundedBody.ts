import { RequestError } from "../../Domains/Requests/RequestRules";
import { HttpError } from "../errors";

function createTooLargeError(maxBytes: number): RequestError
{
    return new RequestError("FILE_TOO_LARGE", [
        {
            field: "file",
            code: "FILE_TOO_LARGE",
            message: `Request body exceeds the maximum permitted size of ${maxBytes} bytes.`,
        },
    ]);
}

/**
 * Reads a request body while enforcing a hard byte ceiling. The declared
 * Content-Length is rejected up front, and the stream is cancelled as soon as
 * the received bytes exceed the ceiling, so oversized bodies are never fully buffered.
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<Uint8Array>
{
    const declared = request.headers.get("content-length");
    if (declared !== null)
    {
        const declaredBytes = Number(declared);
        if (!Number.isFinite(declaredBytes) || declaredBytes < 0)
        {
            throw new HttpError("BAD_REQUEST");
        }
        if (declaredBytes > maxBytes)
        {
            await request.body?.cancel().catch(() => undefined);
            throw createTooLargeError(maxBytes);
        }
    }

    if (request.body === null)
    {
        throw new HttpError("BAD_REQUEST");
    }

    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;
    try
    {
        for (;;)
        {
            const { done, value } = await reader.read();
            if (done)
            {
                break;
            }
            received += value.byteLength;
            if (received > maxBytes)
            {
                await reader.cancel().catch(() => undefined);
                throw createTooLargeError(maxBytes);
            }
            chunks.push(value);
        }
    }
    finally
    {
        reader.releaseLock();
    }

    const body = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks)
    {
        body.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return body;
}
