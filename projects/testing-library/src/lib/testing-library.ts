import { Component, DebugElement, ElementRef, OnInit, Type, NgZone } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { BrowserAnimationsModule, NoopAnimationsModule } from '@angular/platform-browser/animations';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { fireEvent, FireFunction, FireObject, getQueriesForElement, prettyDOM } from '@testing-library/dom';
import { RenderOptions, RenderResult } from './models';
import { createSelectOptions, createType } from './user-events';

@Component({ selector: 'wrapper-component', template: '' })
class WrapperComponent implements OnInit {
  constructor(private elemtRef: ElementRef) {}

  ngOnInit() {
    this.elemtRef.nativeElement.removeAttribute('ng-version');
  }
}

export async function render<T>(template: string, renderOptions: RenderOptions<T>): Promise<RenderResult>;
export async function render<T>(component: Type<T>, renderOptions?: RenderOptions<T>): Promise<RenderResult>;
export async function render<T>(
  templateOrComponent: string | Type<T>,
  renderOptions: RenderOptions<T> = {},
): Promise<RenderResult> {
  const {
    detectChanges = true,
    declarations = [],
    imports = [],
    providers = [],
    schemas = [],
    queries,
    wrapper = WrapperComponent,
    componentProperties = {},
    componentProviders = [],
    excludeComponentDeclaration = false,
    routes,
  } = renderOptions;

  const isTemplate = typeof templateOrComponent === 'string';
  const componentDeclarations = declareComponents({
    templateOrComponent,
    wrapper,
    isTemplate,
    excludeComponentDeclaration,
  });

  TestBed.configureTestingModule({
    declarations: [...declarations, ...componentDeclarations],
    imports: addAutoImports({ imports, routes }),
    providers: [...providers],
    schemas: [...schemas],
  });

  if (componentProviders) {
    componentProviders
      .reduce((acc, provider) => acc.concat(provider), [])
      .forEach(p => {
        const { provide, ...provider } = p;
        TestBed.overrideProvider(provide, provider);
      });
  }

  const fixture = isTemplate
    ? createWrapperComponentFixture(templateOrComponent as string, { wrapper, componentProperties })
    : createComponentFixture(templateOrComponent as Type<T>, { componentProperties });

  await TestBed.compileComponents();

  if (detectChanges) {
    fixture.detectChanges();
  }

  const eventsWithDetectChanges = Object.keys(fireEvent).reduce(
    (events, key) => {
      events[key] = (element: HTMLElement, options?: {}) => {
        const result = fireEvent[key](element, options);
        fixture.detectChanges();
        return result;
      };
      return events;
    },
    {} as FireFunction & FireObject,
  );

  let router = routes ? (TestBed.get<Router>(Router) as Router) : null;
  const zone = TestBed.get<NgZone>(NgZone) as NgZone;

  async function navigate(elementOrPath: Element | string, basePath = '') {
    if (!router) {
      router = TestBed.get<Router>(Router) as Router;
    }

    const href = typeof elementOrPath === 'string' ? elementOrPath : elementOrPath.getAttribute('href');

    await zone.run(() => router.navigate([basePath + href]));
    fixture.detectChanges();
  }

  return {
    fixture,
    container: fixture.nativeElement,
    debug: (element = fixture.nativeElement) => console.log(prettyDOM(element)),
    detectChanges: () => fixture.detectChanges(),
    ...getQueriesForElement(fixture.nativeElement, queries),
    ...eventsWithDetectChanges,
    type: createType(eventsWithDetectChanges),
    selectOptions: createSelectOptions(eventsWithDetectChanges),
    navigate,
  } as any;
}

/**
 * Creates the wrapper component and sets its the template to the to-be-tested component
 */
function createWrapperComponentFixture<T>(
  template: string,
  {
    wrapper,
    componentProperties,
  }: {
    wrapper: RenderOptions<T>['wrapper'];
    componentProperties: RenderOptions<T>['componentProperties'];
  },
): ComponentFixture<any> {
  TestBed.overrideComponent(wrapper, {
    set: {
      template: template,
    },
  });

  const fixture = TestBed.createComponent(wrapper);
  // get the component selector, e.g. <foo color="green"> and <foo> results in foo
  const componentSelector = template.match(/\<(.*?)\ /) || template.match(/\<(.*?)\>/);
  if (!componentSelector) {
    throw Error(`Template ${template} is not valid.`);
  }

  const sut = fixture.debugElement.query(By.css(componentSelector[1]));
  setComponentProperties(sut, { componentProperties });
  return fixture;
}

/**
 * Creates the components and sets its properties
 */
function createComponentFixture<T>(
  component: Type<T>,
  {
    componentProperties = {},
  }: {
    componentProperties: RenderOptions<T>['componentProperties'];
  },
): ComponentFixture<T> {
  const fixture = TestBed.createComponent(component);
  setComponentProperties(fixture, { componentProperties });
  return fixture;
}

/**
 * Set the component properties
 */
function setComponentProperties<T>(
  fixture: ComponentFixture<T> | DebugElement,
  {
    componentProperties = {},
  }: {
    componentProperties: RenderOptions<T>['componentProperties'];
  },
) {
  for (const key of Object.keys(componentProperties)) {
    fixture.componentInstance[key] = componentProperties[key];
  }
  return fixture;
}

function declareComponents({ isTemplate, wrapper, excludeComponentDeclaration, templateOrComponent }) {
  if (isTemplate) {
    return [wrapper];
  }

  if (excludeComponentDeclaration) {
    return [];
  }

  return [templateOrComponent];
}

function addAutoImports({ imports, routes }: Pick<RenderOptions<any>, 'imports' | 'routes'>) {
  const animations = () => {
    const animationIsDefined =
      imports.indexOf(NoopAnimationsModule) > -1 || imports.indexOf(BrowserAnimationsModule) > -1;
    return animationIsDefined ? [] : [NoopAnimationsModule];
  };

  const routing = () => {
    return routes ? [RouterTestingModule.withRoutes(routes)] : [];
  };

  return [...imports, ...animations(), ...routing()];
}
