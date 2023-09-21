import { deserializeError } from 'serialize-error'
import Chainable = Cypress.Chainable
import { type CompareSnapshotsPluginArgs, type UpdateSnapshotArgs } from './plugin.js'

type CompareSnapshotOptions = {
  errorThreshold: number
  failSilently: boolean
}
// todo: are we using this declaration? compareSnapshot is already chainable
// todo: IMHO, all the declarations should be in a separate file

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Cypress {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions
    interface Chainable {
      // eslint-disable-next-line @typescript-eslint/method-signature-style
      compareSnapshot(
        name: string,
        options?: number | Partial<Cypress.ScreenshotOptions | CompareSnapshotOptions>
      ): Chainable<ComparisonResult> | Chainable<boolean>
    }
  }
}

/** Return the errorThreshold from the options settings */
function getErrorThreshold(screenshotOptions: any): number {
  return screenshotOptions?.errorThreshold ?? 0
}

/** Take a screenshot and move screenshot to base or actual folder */
function takeScreenshot(subject: any, name: string, screenshotOptions: any): void {
  let objToOperateOn: any
  const subjectCheck = subject ?? ''
  if (subjectCheck !== '') {
    objToOperateOn = cy.get(subject)
  } else {
    objToOperateOn = cy
  }

  let screenshotPath: string
  // eslint-disable-next-line promise/catch-or-return
  objToOperateOn
    .screenshot(name, {
      ...screenshotOptions,
      onAfterScreenshot(_el: any, props: any) {
        screenshotPath = props.path
      }
    })
    .then(() => {
      return cy.wrap(screenshotPath).as('screenshotAbsolutePath')
    })
}

function updateBaseScreenshot(screenshotName: string): Chainable<boolean> {
  return cy.get('@screenshotAbsolutePath').then((screenshotAbsolutePath: unknown) => {
    if (typeof screenshotAbsolutePath !== 'string') {
      throw new Error('Could not resolve screenshot path')
    }
    const args: UpdateSnapshotArgs = {
      screenshotName,
      specName: Cypress.spec.name,
      screenshotAbsolutePath,
      baseDirectory: Cypress.env('visualRegression').baseDirectory
    }
    return cy.task('updateSnapshot', args)
  })
}

export type ComparisonResult = {
  error?: Error
  mismatchedPixels: number
  percentage: number
}

/** Call the plugin to compare snapshot images and generate a diff */
function compareScreenshots(name: string, screenshotOptions: any): Chainable<ComparisonResult> {
  return cy.get('@screenshotAbsolutePath').then((screenshotAbsolutePath: unknown) => {
    if (typeof screenshotAbsolutePath !== 'string') {
      throw new Error('Could not resolve screenshot path')
    }
    const errorThreshold = getErrorThreshold(screenshotOptions)
    const options: CompareSnapshotsPluginArgs = {
      screenshotName: name,
      errorThreshold,
      // @ts-expect-error TODO fix potential null error
      specName: Cypress.config().spec.name,
      screenshotAbsolutePath,
      baseDirectory: Cypress.env('visualRegression').baseDirectory,
      diffDirectory: Cypress.env('visualRegression').diffDirectory,
      generateDiff: Cypress.env('visualRegression').generateDiff
    }

    let failSilently = false
    if (screenshotOptions.failSilently !== undefined) {
      failSilently = screenshotOptions.failSilently
    } else if (Cypress.env('visualRegression').failSilently !== undefined) {
      failSilently = Cypress.env('visualRegression').failSilently
    }

    return cy.task('compareSnapshotsPlugin', options).then((results: any) => {
      if (results.error !== undefined && !failSilently) {
        throw deserializeError(results.error)
      }
      return results
    })
  })
}

/** Add custom cypress command to compare image snapshots of an element or the window. */
export function compareSnapshotCommand(
  defaultScreenshotOptions?: Partial<Cypress.ScreenshotOptions | CompareSnapshotOptions>
): void {
  Cypress.Commands.add(
    'compareSnapshot',
    { prevSubject: 'optional' },
    function (subject: any, name: string, params: any = {}): Chainable<ComparisonResult> | Chainable<boolean> {
      const type = Cypress.env('visualRegression').type as string
      let screenshotOptions: any
      if (typeof params === 'object') {
        screenshotOptions = { ...defaultScreenshotOptions, ...params }
      } else if (typeof params === 'number') {
        screenshotOptions = { ...defaultScreenshotOptions, errorThreshold: params }
      } else {
        screenshotOptions = { ...defaultScreenshotOptions, errorThreshold: 0 }
      }

      takeScreenshot(subject, name, screenshotOptions)

      switch (type) {
        case 'regression':
          return compareScreenshots(name, screenshotOptions)
        case 'base':
          return updateBaseScreenshot(name)
        default:
          throw new Error(
            `The "type" environment variable is unknown. \nExpected: "regression" or "base" \nActual: ${type}`
          )
      }
    }
  )
}
