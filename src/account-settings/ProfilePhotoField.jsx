import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { injectIntl, intlShape } from '@edx/frontend-platform/i18n';
import {
  Alert, Avatar, Button, Spinner,
} from '@openedx/paragon';

import messages from './AccountSettingsPage.messages';
import { saveProfilePhoto, deleteProfilePhoto } from './data/actions';
import { profilePhotoSelector } from './data/selectors';

class ProfilePhotoField extends React.Component {
  constructor(props) {
    super(props);

    this.fileInput = React.createRef();
    this.form = React.createRef();

    this.onClickUpload = this.onClickUpload.bind(this);
    this.onClickRemove = this.onClickRemove.bind(this);
    this.onChangeInput = this.onChangeInput.bind(this);
  }

  onClickUpload() {
    this.fileInput.current.click();
  }

  onClickRemove() {
    this.props.deleteProfilePhoto();
  }

  onChangeInput() {
    // The hidden input's name must be 'file' to match the accounts image endpoint.
    this.props.saveProfilePhoto(new FormData(this.form.current));
    this.form.current.reset();
  }

  hasImage() {
    return Boolean(this.props.profileImage && this.props.profileImage.has_image);
  }

  renderImage() {
    const { intl } = this.props;
    const alt = intl.formatMessage(messages['account.settings.field.profile.image.alt']);

    if (this.hasImage()) {
      return (
        <img
          data-hj-suppress
          className="profile-image-field__img rounded-circle"
          style={{
            width: '6rem', height: '6rem', objectFit: 'cover',
          }}
          alt={alt}
          src={this.props.profileImage.image_url_full}
        />
      );
    }

    return <Avatar size="lg" alt={alt} />;
  }

  render() {
    const { intl, savePhotoState, photoError } = this.props;
    const isPending = savePhotoState === 'pending';

    return (
      <div className="form-group" id="field-profile-image">
        <h6 aria-level="3">
          {intl.formatMessage(messages['account.settings.field.profile.image'])}
        </h6>
        {photoError != null && (
          <Alert variant="danger">{photoError}</Alert>
        )}
        <div className="d-flex align-items-center">
          <div className="position-relative mr-3">
            {this.renderImage()}
            {isPending && (
              <div
                className="position-absolute w-100 h-100 d-flex justify-content-center align-items-center rounded-circle"
                style={{ top: 0, left: 0, backgroundColor: 'rgba(0,0,0,.65)' }}
              >
                <Spinner
                  animation="border"
                  variant="light"
                  screenReaderText={intl.formatMessage(messages['account.settings.loading.message'])}
                />
              </div>
            )}
          </div>
          <div>
            <Button
              variant="outline-primary"
              className="mr-2"
              onClick={this.onClickUpload}
              disabled={isPending}
            >
              {intl.formatMessage(messages['account.settings.field.profile.image.upload'])}
            </Button>
            {this.hasImage() && (
              <Button
                variant="link"
                onClick={this.onClickRemove}
                disabled={isPending}
              >
                {intl.formatMessage(messages['account.settings.field.profile.image.remove'])}
              </Button>
            )}
          </div>
        </div>
        <form ref={this.form} encType="multipart/form-data">
          {/* The name of this input must be 'file' (accounts image endpoint contract). */}
          <input
            className="d-none"
            ref={this.fileInput}
            type="file"
            name="file"
            id="profile-image-file"
            onChange={this.onChangeInput}
            accept=".png,.jpg,.jpeg"
          />
        </form>
      </div>
    );
  }
}

ProfilePhotoField.propTypes = {
  profileImage: PropTypes.shape({
    has_image: PropTypes.bool,
    image_url_full: PropTypes.string,
  }),
  savePhotoState: PropTypes.oneOf([null, 'pending', 'complete', 'error']),
  photoError: PropTypes.string,
  saveProfilePhoto: PropTypes.func.isRequired,
  deleteProfilePhoto: PropTypes.func.isRequired,
  intl: intlShape.isRequired,
};

ProfilePhotoField.defaultProps = {
  profileImage: null,
  savePhotoState: null,
  photoError: null,
};

export default connect(profilePhotoSelector, {
  saveProfilePhoto,
  deleteProfilePhoto,
})(injectIntl(ProfilePhotoField));
