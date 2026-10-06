/** Saves a blob through a temporary link. The object URL is revoked on a delay:
 *  revoking it synchronously after click() cancels the download in some
 *  browsers before the file has been handed over, which shows up as a download
 *  that "does nothing", most often for larger files like ZIPs. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}
