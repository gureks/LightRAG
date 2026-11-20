import { useState, useCallback, useEffect } from 'react'
import { FileRejection } from 'react-dropzone'
import Button from '@/components/ui/Button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@/components/ui/Dialog'
import FileUploader from '@/components/ui/FileUploader'
import Input from '@/components/ui/Input'
import { toast } from 'sonner'
import { supportedFileTypes } from '@/lib/constants'
import {
  deriveUploaderInputs,
  flattenAcceptExtensions,
  formatFileTypesLabel,
  normalizeSupportedFileTypes,
  type FileTypesState
} from '@/lib/fileTypes'
import { errorMessage } from '@/lib/utils'
import { getSupportedFileTypes, insertUrl, uploadDocument } from '@/api/lightrag'

import { LinkIcon, UploadIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface UploadDocumentsDialogProps {
  onDocumentsUploaded?: () => Promise<void>
  /**
   * Fired once per batch as soon as the first file is accepted by the server.
   * Lets the parent start its activity probe as early as possible (rather
   * than waiting for the whole sequential batch to finish).
   */
  onUploadBatchAccepted?: () => void
}

export default function UploadDocumentsDialog({
  onDocumentsUploaded,
  onUploadBatchAccepted
}: UploadDocumentsDialogProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progresses, setProgresses] = useState<Record<string, number>>({})
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({})
  const [fileTypes, setFileTypes] = useState<FileTypesState>({ status: 'idle' })
  const [urlInput, setUrlInput] = useState('')
  const [urlError, setUrlError] = useState<string | null>(null)
  const [isUrlSubmitting, setIsUrlSubmitting] = useState(false)

  // Fetch the live allowlist + engine capability matrix while the dialog is
  // open. `loading` is entered synchronously in onOpenChange (not here) so
  // the very first open render already has the uploader disabled.
  useEffect(() => {
    if (!open) return
    const controller = new AbortController()
    getSupportedFileTypes(controller.signal)
      .then((res) => {
        if (controller.signal.aborted) return
        const data = normalizeSupportedFileTypes(res)
        setFileTypes(data ? { status: 'ready', data } : { status: 'fallback' })
      })
      .catch((err) => {
        if (controller.signal.aborted) return
        // Old backend (404) or transient failure: fall back to the static
        // allowlist and let the server judge hinted filenames.
        console.warn('Failed to fetch supported file types:', errorMessage(err))
        setFileTypes({ status: 'fallback' })
      })
    return () => controller.abort()
  }, [open])

  const handleRejectedFiles = useCallback(
    (rejectedFiles: FileRejection[]) => {
      // Process rejected files and add them to fileErrors
      rejectedFiles.forEach(({ file, errors }) => {
        // Get the first error message
        let errorMsg = errors[0]?.message || t('documentPanel.uploadDocuments.fileUploader.fileRejected', { name: file.name })

        // Simplify error message for unsupported file types
        if (errorMsg.includes('file-invalid-type')) {
          errorMsg = t('documentPanel.uploadDocuments.fileUploader.unsupportedType')
        }

        // Set progress to 100% to display error message
        setProgresses((pre) => ({
          ...pre,
          [file.name]: 100
        }))

        // Add error message to fileErrors
        setFileErrors(prev => ({
          ...prev,
          [file.name]: errorMsg
        }))
      })
    },
    [setProgresses, setFileErrors, t]
  )

  const handleDocumentsUpload = useCallback(
    async (filesToUpload: File[]) => {
      setIsUploading(true)
      let hasSuccessfulUpload = false

      // Only clear errors for files that are being uploaded, keep errors for rejected files
      setFileErrors(prev => {
        const newErrors = { ...prev };
        filesToUpload.forEach(file => {
          delete newErrors[file.name];
        });
        return newErrors;
      });

      // Show uploading toast
      const toastId = toast.loading(t('documentPanel.uploadDocuments.batch.uploading'))

      try {
        // Track errors locally to ensure we have the final state
        const uploadErrors: Record<string, string> = {}
        let batchProbeTriggered = false

        // Create a collator that supports Chinese sorting
        const collator = new Intl.Collator(['zh-CN', 'en'], {
          sensitivity: 'accent',  // consider basic characters, accents, and case
          numeric: true           // enable numeric sorting, e.g., "File 10" will be after "File 2"
        });
        const sortedFiles = [...filesToUpload].sort((a, b) =>
          collator.compare(a.name, b.name)
        );

        // Upload files in sequence, not parallel
        for (const file of sortedFiles) {
          try {
            // Initialize upload progress
            setProgresses((pre) => ({
              ...pre,
              [file.name]: 0
            }))

            const result = await uploadDocument(file, (percentCompleted: number) => {
              console.debug(t('documentPanel.uploadDocuments.single.uploading', { name: file.name, percent: percentCompleted }))
              setProgresses((pre) => ({
                ...pre,
                [file.name]: percentCompleted
              }))
            })

            if (result.status !== 'success') {
              uploadErrors[file.name] = result.message
              setFileErrors(prev => ({
                ...prev,
                [file.name]: result.message
              }))
            } else {
              // Mark that we had at least one successful upload
              hasSuccessfulUpload = true
              if (!batchProbeTriggered) {
                batchProbeTriggered = true
                onUploadBatchAccepted?.()
              }
            }
          } catch (err) {
            console.error(`Upload failed for ${file.name}:`, err)

            // Handle HTTP errors, including 400 errors
            let errorMsg = errorMessage(err)
            const duplicateFileMsg = t('documentPanel.uploadDocuments.fileUploader.duplicateFile')

            // If it's an axios error with response data, try to extract more detailed error info
            if (err && typeof err === 'object' && 'response' in err) {
              const axiosError = err as { response?: { status: number, data?: { detail?: string } } }
              const status = axiosError.response?.status
              const detail = axiosError.response?.data?.detail
              if (status === 409) {
                // Server now rejects same-name uploads with HTTP 409 instead of
                // returning a 200 ``status="duplicated"`` payload.  Map the most
                // common cases (existing record / file in INPUT dir) back to the
                // dedicated "duplicate file" UI affordance, and surface other
                // 409 reasons (pipeline busy / scanning) verbatim from the
                // server detail so users can tell why they were rejected.
                if (
                  typeof detail === 'string' &&
                  (/already contains/i.test(detail) || /Status:/i.test(detail))
                ) {
                  errorMsg = duplicateFileMsg
                } else {
                  errorMsg = detail || errorMsg
                }
              } else if (status === 400 || status === 413 || status === 429 || status === 503) {
                // 400 invalid request, 413 body/file too large, 429 pipeline at
                // capacity (MAX_PENDING_DOCUMENTS — the detail carries how many
                // documents are active, how many were requested, the capacity and
                // a retry hint), 503 document storage unavailable. Each detail is
                // written to be shown to a user verbatim.
                errorMsg = detail || errorMsg
              }

              // Set progress to 100% to display error message
              setProgresses((pre) => ({
                ...pre,
                [file.name]: 100
              }))
            }

            // Record error message in both local tracking and state
            uploadErrors[file.name] = errorMsg
            setFileErrors(prev => ({
              ...prev,
              [file.name]: errorMsg
            }))
          }
        }

        // Check if any files failed to upload using our local tracking
        const hasErrors = Object.keys(uploadErrors).length > 0

        // Update toast status
        if (hasErrors) {
          toast.error(t('documentPanel.uploadDocuments.batch.error'), { id: toastId })
        } else {
          toast.success(t('documentPanel.uploadDocuments.batch.success'), { id: toastId })
        }

        // Only update if at least one file was uploaded successfully
        if (hasSuccessfulUpload) {
          // Refresh document list
          if (onDocumentsUploaded) {
            onDocumentsUploaded().catch(err => {
              console.error('Error refreshing documents:', err)
            })
          }
        }
      } catch (err) {
        console.error('Unexpected error during upload:', err)
        toast.error(t('documentPanel.uploadDocuments.generalError', { error: errorMessage(err) }), { id: toastId })
      } finally {
        setIsUploading(false)
      }
    },
    [setIsUploading, setProgresses, setFileErrors, t, onDocumentsUploaded, onUploadBatchAccepted]
  )

  const handleUrlSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = urlInput.trim()
      if (!trimmed) {
        setUrlError('Please enter a valid http:// or https:// URL')
        return
      }
      try {
        const parsed = new URL(trimmed)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          setUrlError('URL must start with http:// or https://')
          return
        }
      } catch {
        setUrlError('Please enter a valid URL')
        return
      }

      setUrlError(null)
      setIsUrlSubmitting(true)
      const toastId = toast.loading('Fetching and ingesting URL...')
      try {
        const result = await insertUrl(trimmed)
        if (result.status === 'success') {
          toast.success(result.message || 'URL queued for ingestion', { id: toastId })
          setUrlInput('')
          onUploadBatchAccepted?.()
          onDocumentsUploaded?.().catch((err) => {
            console.error('Error refreshing documents:', err)
          })
        } else {
          const msg = result.message || 'URL ingestion failed'
          setUrlError(msg)
          toast.error(msg, { id: toastId })
        }
      } catch (err) {
        const msg = errorMessage(err)
        setUrlError(msg)
        toast.error(msg, { id: toastId })
      } finally {
        setIsUrlSubmitting(false)
      }
    },
    [urlInput, onUploadBatchAccepted, onDocumentsUploaded]
  )

  const uploaderInputs = deriveUploaderInputs(fileTypes)

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (isUploading || isUrlSubmitting) {
          return
        }
        if (nextOpen) {
          // Enter loading synchronously so the first open render already has
          // the uploader disabled — no window where a hinted file could start
          // uploading before the capability matrix arrives.
          setFileTypes({ status: 'loading' })
        } else {
          setProgresses({})
          setFileErrors({})
          setUrlInput('')
          setUrlError(null)
          setFileTypes({ status: 'idle' })
        }
        setOpen(nextOpen)
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default" side="bottom" tooltip={t('documentPanel.uploadDocuments.tooltip')} size="sm">
          <UploadIcon /> {t('documentPanel.uploadDocuments.button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl" onCloseAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('documentPanel.uploadDocuments.title')}</DialogTitle>
          <DialogDescription>
            {t('documentPanel.uploadDocuments.description')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleUrlSubmit} className="space-y-2 border-b border-border pb-4">
          <label
            htmlFor="document-url-input"
            className="text-xs font-medium text-foreground flex items-center gap-1.5"
          >
            <LinkIcon className="h-3.5 w-3.5" />
            Ingest from URL (web page or supported document file)
          </label>
          <div className="flex items-center gap-2">
            <Input
              id="document-url-input"
              type="url"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value)
                if (urlError) setUrlError(null)
              }}
              placeholder="https://example.com/article or https://example.com/report.pdf"
              disabled={isUrlSubmitting || isUploading}
              className="flex-1"
            />
            <Button
              type="submit"
              variant="default"
              size="sm"
              disabled={isUrlSubmitting || isUploading || !urlInput.trim()}
            >
              {isUrlSubmitting ? 'Fetching...' : 'Ingest URL'}
            </Button>
          </div>
          {urlError && (
            <p className="text-xs text-danger" role="alert">
              {urlError}
            </p>
          )}
        </form>
        <FileUploader
          maxFileCount={Infinity}
          maxSize={200 * 1024 * 1024}
          description={t('documentPanel.uploadDocuments.fileTypes', {
            types: formatFileTypesLabel(
              uploaderInputs.acceptedExtensions ?? flattenAcceptExtensions(supportedFileTypes)
            )
          })}
          onUpload={handleDocumentsUpload}
          onReject={handleRejectedFiles}
          progresses={progresses}
          fileErrors={fileErrors}
          disabled={isUploading || uploaderInputs.disabled}
          acceptedExtensions={uploaderInputs.acceptedExtensions}
          engineCapabilities={uploaderInputs.engineCapabilities}
        />
      </DialogContent>
    </Dialog>
  )
}
