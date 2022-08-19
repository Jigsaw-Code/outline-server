# Code Design Principle

This repository follows the principles of [Domain Driven Design](https://martinfowler.com/bliki/DomainDrivenDesign.html).
It centers the development on a rich domain model that reflects the product concepts.
There are multiple books and online resources about DDD (e.g. [summary of patterns](https://dzone.com/refcardz/getting-started-domain-driven)).

The idea is to keep complexity under control, so that the code is not more complex than the problem domain. Also we want any product change to
require a code change that is proportional in size (in otther words, a small product change shouldn't require a lot of work, and a large product
change should be accompanied by the needed refactoring to keep product and code aligned).

Below we describe some of the core patterns we follow.

## Ubiquitous language

We use the same language in the code, the UI and the product communications. If we want to change the language in the product, we should update the code and the UI.
This makes sure that the language we use is accurate and consistent across the stack and functions. We don't want the overhead to be translating between product and code language.

## Application Architecture

We use a layered architecture to keep code in the right abtraction level and preserve the Domain Model. We have the following layers:
- Domain Model
- Application
- UI
- Infrastructure

### Domain Model

The Domain Model encodes the product concepts of the domain.
- Must only contain domain concepts that are exposed to clients. Application concepts like persistence do not belog here. This documents the product and works as a forcing function to keep the code aligned with the product.
- The Domain Model can only depend on Infrastructure. It must not depend on the Application and UI. The domain may conceptually be reusable in another application.

### UI

We prefer LitElement in Typescript for new UI compoenents, but we have many old Polymer elements in Javascript. 

- UI components should be mostly "dumb" and reusable. Think of them as usable in another application, such as our [Gallery App](./src/server_manager/web_app/gallery_app). This makes the components easier to test and reason about.
- UI components must not depend on the model or application. It can depend on other UI components and infrastructure.

See [Custom Element Best Practices](https://developers.google.com/web/fundamentals/web-components/best-practices).

### Infrastructure

Tools outside the bounded context of our application. Think of it as utility libraries independent of our application that could potentially be provided by a third-party.
- All components can depend on infrastructure, but infrastructure can only depend on infrastructure.

### Application

The application layer puts everthing together. It implements most of the Domain Model and connects it to the UI components. The pattern here is quite similar to Model-View-Presenter, where the application is the Presenter, the Domain Model is the Model and the UI is the View.

- The application layer can depend on all the other layers.